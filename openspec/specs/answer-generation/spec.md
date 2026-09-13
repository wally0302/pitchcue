# answer-generation Specification

## Purpose
根據專案文件與本場先前問答，為每一題串流生成固定結構的「重點」與「口語稿」，讓簡報者照著唸就能回答。內容只能來自文件，不得捏造。

## Requirements

### Requirement: 接收問題與歷史
`POST /api/answer` SHALL 接受 JSON `{ question, history }`。`question` 去除前後空白後不可為空；`history` 為 `{ q, a }` 陣列，過濾掉 q 或 a 為空的項目後只保留最後 8 組。

#### Scenario: 問題為空
- **WHEN** `question` 為空字串或只有空白
- **THEN** 回傳 400 與錯誤訊息「沒有問題內容」

#### Scenario: body 不是 JSON
- **WHEN** 請求 body 無法解析
- **THEN** 回傳 400 與錯誤訊息「bad json」

#### Scenario: 歷史超過上限
- **WHEN** `history` 有 12 組問答
- **THEN** 只有最後 8 組被送入模型

### Requirement: 固定 system prompt 放最前面以命中 prompt cache
系統 SHALL 把 `ANSWER_SYSTEM`（含完整 `<project_docs>` 知識檔）作為第一則 developer message，之後依序放歷史問答（user / assistant 交替），最後放本題 user message。請求帶 `prompt_cache_key`（環境變數 `PROMPT_CACHE_KEY`，預設 `hackathon-qa-v1`）、`store: false`、`max_output_tokens: 900`、reasoning effort `none`，模型為 `OPENAI_CHAT_MODEL`（預設 `gpt-5.6-terra`）。

#### Scenario: 連續兩題
- **WHEN** 同一部署連續回答兩題
- **THEN** 第二題的 input 開頭與第一題完全相同，伺服器 log 顯示 `cached` token 數大於 0

#### Scenario: 沒有專案文件
- **WHEN** `KNOWLEDGE_MD` 為空
- **THEN** `<project_docs>` 內為「（尚未提供專案文件）」，模型回答會說目前沒有實際數據

### Requirement: 回答規則
system prompt SHALL 要求模型：使用台灣繁體中文、以「我們」第一人稱；只根據文件回答，文件沒有的數據誠實說「這部分我們目前沒有實際數據」再給方向，絕不捏造數字、客戶、合作對象；多個子問題每個都回應；涉及「剛剛講的那個」要接續先前問答；面對質疑先肯定風險再說怎麼處理；承認限制之後一定接具體下一步；問題聽不清楚或有多種解讀時，重點第一條寫「評審可能在問：A 或 B」，口語稿第一句用一句話確認後直接回答最可能的解讀。

#### Scenario: 文件沒有的數字
- **WHEN** 評審問「你們的月活是多少」而文件沒寫
- **THEN** 回答明說沒有實際數據，並給出驗證方向，不出現編造的數字

#### Scenario: 指涉前一題
- **WHEN** history 有前一題談定價，本題為「剛剛講的那個成本能再壓低嗎」
- **THEN** 回答接續前一題的定價內容

### Requirement: 輸出格式固定
回答 SHALL 為 Markdown，只有兩節、順序固定：`## 重點` 底下 3 到 5 條、每條一句不超過 25 字；`## 口語稿` 為一段 30 到 60 秒可直接唸的口語回答，第一句先用半句話接住評審的問題，不條列、不加標題。

#### Scenario: 正常回答
- **WHEN** 模型完成輸出
- **THEN** 內容依序含「## 重點」與「## 口語稿」兩節，前端可用 Markdown 渲染出螢光筆重點與段落口語稿

### Requirement: 串流回傳純文字
系統 SHALL 以 `text/plain; charset=utf-8` 串流回傳，標頭含 `Cache-Control: no-cache, no-transform` 與 `X-Accel-Buffering: no`；每個 `response.output_text.delta` 事件立即寫入；串流中的 `error` 事件以「\n\n[錯誤] 訊息」附在內容尾端；`response.completed` 時在伺服器 log 記錄 input、cached、output token 數。

#### Scenario: 逐字出現
- **WHEN** 模型開始輸出
- **THEN** 客戶端在完整回答生成前就能收到並顯示部分內容

#### Scenario: 串流中途錯誤
- **WHEN** OpenAI 串流回傳 error 事件
- **THEN** 已輸出內容保留，尾端追加「[錯誤]」說明，串流正常關閉

### Requirement: 建立串流失敗
建立 OpenAI 請求失敗時 SHALL 回傳 500，錯誤訊息以「回答生成失敗：」開頭並附上原因。

#### Scenario: 缺少 API key
- **WHEN** 未設定 `OPENAI_API_KEY`
- **THEN** 回傳 500，訊息含「缺少 OPENAI_API_KEY 環境變數」

### Requirement: 支援客戶端中止
系統 SHALL 把請求的 abort signal 傳給 OpenAI 呼叫；客戶端中止時停止串流且不把 AbortError 當作錯誤寫入內容。

#### Scenario: 使用者按停止
- **WHEN** 客戶端中止 fetch
- **THEN** 伺服器停止向 OpenAI 讀取，內容尾端不出現「[錯誤]」

### Requirement: 執行環境限制
此 route SHALL 使用 Node.js runtime，最長執行 120 秒，並套用 access-control 的登入 session 檢查（`requireSession`）。

#### Scenario: 未帶密碼
- **WHEN** 請求沒有帶有效的登入 session cookie
- **THEN** 在解析 body 前即回傳 401
