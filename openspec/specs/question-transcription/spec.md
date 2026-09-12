# question-transcription Specification

## Purpose
把評審提問的錄音轉成文字，再整理成簡報者一眼看懂的完整問句，並標示辨識信心。錄音品質差、評審用陳述句或省略主詞提問時，仍要給出可用的問題文字。

## Requirements

### Requirement: 接收錄音並驗證
`POST /api/transcribe` SHALL 接受 multipart form，欄位 `audio` 為音檔 Blob、`ext` 為副檔名。音檔小於 1000 bytes 視為沒錄到聲音。副檔名只保留英數字元，預設 `webm`；MIME 取 Blob type 去掉參數的部分，預設 `audio/webm`。

#### Scenario: 音檔太小
- **WHEN** `audio` 小於 1000 bytes
- **THEN** 回傳 400 與錯誤訊息「沒有錄到聲音，請再試一次」

#### Scenario: 無法解析 form
- **WHEN** 請求 body 不是合法的 multipart form
- **THEN** 回傳 400 與錯誤訊息「無法讀取音檔」

### Requirement: 語音轉文字
系統 SHALL 以 `OPENAI_TRANSCRIBE_MODEL`（預設 `gpt-transcribe`）呼叫 OpenAI 轉錄，指定語言 `zh-tw` 與 `en`，帶入最多 50 個 `GLOSSARY_TERMS` 作為 keywords，並附上說明情境（黑客松評審提問、台灣繁體中文夾雜英文技術名詞）與名詞表的 prompt。

#### Scenario: 成功轉錄
- **WHEN** 音檔含可辨識語音
- **THEN** 得到原始逐字稿 `raw`，進入整理步驟

#### Scenario: 沒有辨識到內容
- **WHEN** 轉錄結果為空字串
- **THEN** 回傳 422 與錯誤訊息「沒有辨識到內容，請再試一次」

#### Scenario: OpenAI 呼叫失敗
- **WHEN** 轉錄 API 拋出錯誤
- **THEN** 回傳 500，錯誤訊息以「語音辨識失敗：」開頭並附上原因

### Requirement: 整理成完整問句並判斷信心
系統 SHALL 以 `OPENAI_CLEAN_MODEL`（預設 `gpt-5.6-luna`）、reasoning effort `none`、JSON schema 嚴格輸出 `{ question, confidence }`，把逐字稿改寫成清楚簡潔的台灣繁體中文問題。整理規則：去掉贅字與口頭禪、對照名詞表修正同音錯字、陳述句或省略主詞的提問補成完整問句、多個子問題以 1. 2. 3. 條列、只輸出問題不回答。`confidence` 為 `high`、`medium`、`low` 三級；`low` 時 `question` 為修正錯字後的原文而非硬編的問題。

#### Scenario: 清楚的提問
- **WHEN** 逐字稿為「那個你們這個成本大概是多少」
- **THEN** `question` 為完整問句（例如「你們的成本大概是多少？」），`confidence` 為 `high`

#### Scenario: 多個子問題
- **WHEN** 評審一次問了定價與競品差異
- **THEN** `question` 以 1. 2. 條列兩個子問題

#### Scenario: 只有零散字詞
- **WHEN** 逐字稿只有寒暄或雜訊
- **THEN** `confidence` 為 `low`，`question` 為修正錯字後的原文

### Requirement: 整理失敗時退回原始逐字稿
整理步驟失敗（API 錯誤、JSON 解析失敗）SHALL 不讓整個請求失敗：`question` 退回 `raw`，`confidence` 設為 `medium`，並在伺服器記錄錯誤。

#### Scenario: 整理模型逾時
- **WHEN** 整理呼叫拋出錯誤
- **THEN** 回傳 200，`question` 等於 `raw`，`confidence` 為 `medium`

### Requirement: 回傳格式
成功時 SHALL 回傳 JSON `{ raw, question, confidence }`，`raw` 為原始逐字稿、`question` 為整理後問題、`confidence` 為三級信心之一。

#### Scenario: 正常回應
- **WHEN** 轉錄與整理都成功
- **THEN** 三個欄位齊全，前端可據此建立題目卡片

### Requirement: 執行環境限制
此 route SHALL 使用 Node.js runtime，最長執行 60 秒，並套用 access-control 的密碼檢查。

#### Scenario: 未帶密碼
- **WHEN** 設定了 `APP_PASSWORD` 但請求沒有正確的 `x-app-key`
- **THEN** 在讀取音檔前即回傳 401
