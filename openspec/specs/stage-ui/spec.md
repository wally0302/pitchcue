# stage-ui Specification

## Purpose
主控頁的畫面與操作：上台前的準備狀態、有題目後的閱讀狀態。手機單手操作優先，錄音鈕永遠在最上面，閱讀狀態把最新一題放大、舊題全部展開列在下面。

## Requirements

### Requirement: 純客戶端渲染
主控頁 `/` 與觀看頁 `/view` SHALL 以 `ssr: false` 動態載入元件，載入中顯示「載入中…」，避免麥克風、localStorage、URL 參數造成 hydration 不一致。

#### Scenario: 首次載入
- **WHEN** 開啟 `/`
- **THEN** 先出現「載入中…」，接著在客戶端渲染 App，且沒有 hydration 警告

### Requirement: 準備狀態
沒有任何題目時 SHALL 顯示準備狀態：大顆錄音鈕（「開始錄音」／錄音中顯示「停止錄音 mm:ss」）、「準備麥克風」鈕（就緒後改為綠燈「麥克風已就緒」）、「暖機」鈕、打字輸入框與送出鈕、操作說明文案；此時不顯示頂端操作列。

#### Scenario: 開場
- **WHEN** 題目清單為空
- **THEN** 畫面有 `.prep` 區與大錄音鈕，沒有 `.actionbar`

#### Scenario: 打字送出第一題
- **WHEN** 在準備狀態的輸入框輸入文字並按 Enter（非輸入法組字中）
- **THEN** 建立題目並切換到閱讀狀態

### Requirement: 閱讀狀態與頂端操作列
有題目後 SHALL 永遠是閱讀狀態：頂欄下方貼著一條固定在畫面頂端、往下捲也跟著的操作列，含一顆同時負責開始與停止的錄音鈕（「錄下一題」／「停止 mm:ss」；未授權時多一個「需授權」標記）與一顆鍵盤鈕。錄音鈕高度至少 48px、寬度至少視窗的六成。

#### Scenario: 往下捲
- **WHEN** 閱讀狀態往下捲動 600px
- **THEN** 錄音鈕仍在畫面頂端 80px 內

#### Scenario: 重新整理後未授權
- **WHEN** 有題目但麥克風尚未授權
- **THEN** 錄音鈕顯示「需授權」標記，按下去先授權再錄

### Requirement: 打字備援
鍵盤鈕 SHALL 在操作列底下展開輸入面板（textarea、取消、送出）；Enter（非 Shift、非組字中）送出並收起，Escape 收起，空白內容不能送出。

#### Scenario: 麥克風壞掉
- **WHEN** 按鍵盤鈕輸入「第三題」並按 Enter
- **THEN** 面板收起，「第三題」成為最新一題並開始生成

### Requirement: 最新一題在上、歷史全部展開
Stage SHALL 把序號最大的題目放最上面並加 `card-latest` 樣式，其餘題目在「歷史」標籤下依序號遞減排列，每張都完整展開內容，沒有收起功能；只有歷史裡的題目有「刪除」鈕，最新一題沒有。

#### Scenario: 三題
- **WHEN** 有 Q1、Q2、Q3
- **THEN** Q3 在最上方為 card-latest，底下「歷史」依序 Q2、Q1，三張都看得到重點與口語稿

#### Scenario: 刪除舊題
- **WHEN** 對歷史中的 Q1 按「刪除」並確認
- **THEN** Q1 消失，其餘題目不變

### Requirement: 題目卡片
QuestionCard SHALL 顯示序號、狀態（transcribing「轉錄中」、ready「待回答」、answering「生成回答中」、done「完成」、error「錯誤」，有 phase 時顯示 phase，忙碌時有 spinner）；問題文字平常是靜態按鈕，點一下才變 textarea 可編輯，失焦收起，Cmd/Ctrl+Enter 觸發生成；原始逐字稿與整理後問題不同時顯示「原始逐字稿：」；`confidence` 為 low 顯示紅字警告「辨識不太清楚，已先生成；講之前對一下問題文字…」、medium 顯示一般提示「整理時不太確定…」；有回答或 answering 時以 AnswerView 渲染；answering 時顯示「停止」鈕，否則顯示「生成回答」（ready）或「重新生成」（其他），問題為空或轉錄中時停用。

#### Scenario: 點問題修改
- **WHEN** 點最新一題的問題文字
- **THEN** 出現 textarea，內容為原問題

#### Scenario: 轉錄中
- **WHEN** 狀態為 transcribing
- **THEN** 顯示「正在把評審的問題轉成文字…」，問題不可編輯，生成鈕停用

### Requirement: 回答渲染
AnswerView SHALL 以 Markdown 渲染回答；串流中且尚無內容時顯示「思考中…」；串流中顯示游標；清單項目包在 `.mark` 螢光筆樣式內。

#### Scenario: 已完成的回答
- **WHEN** 回答含「## 重點」兩條與「## 口語稿」一段
- **THEN** 畫面有兩個 `.mark` 重點與一個口語稿段落

### Requirement: 頂欄與選單
頂欄 SHALL 顯示「PitchCue」標題、同步狀態圓點（綠＝已同步、黃＝同步中、紅＝同步失敗、未啟用或已結束不顯示，說明放在 title）、右上角 ⋯ 選單。選單項目：「組員觀看連結」永遠有；「結束本場」只在閱讀狀態且同步狀態為 idle、syncing 或 error 時有；「清除本場」（危險樣式，需確認）只在閱讀狀態有。選單在點外面或 Escape 時關閉。

#### Scenario: 未設定 Redis
- **WHEN** 同步狀態為 off
- **THEN** 頂欄沒有圓點，選單沒有「結束本場」

#### Scenario: 取得觀看連結
- **WHEN** 選「組員觀看連結」且 Redis 已設定
- **THEN** 顯示 `<origin>/view?code=<ROOM_CODE>` 連結、「複製」與「關閉」鈕；未設定時顯示「尚未設定 Upstash Redis，組員共享未啟用（見 README）。」

### Requirement: 桌機快捷鍵
在非輸入框焦點時 SHALL 支援：Space 切換錄音、Escape 中止最新一題的生成、Cmd/Ctrl+Enter 對最新一題重新生成（轉錄中或生成中除外）。

#### Scenario: 空白鍵
- **WHEN** 焦點不在輸入框時按 Space
- **THEN** 開始或停止錄音，且不捲動頁面

### Requirement: 手機寬度不溢出
在 390px 寬的手機視窗 SHALL 沒有水平捲動，準備狀態與閱讀狀態皆然。

#### Scenario: 有資料時
- **WHEN** 閱讀狀態含多題長回答
- **THEN** `document.documentElement.scrollWidth` 不大於視窗寬度

### Requirement: UI smoke test
`npm run test:ui` SHALL 以 headless Chrome 走過準備狀態、閱讀狀態、打字送出、觀看頁代碼錯誤與（有 Redis 時）輪詢與結束本場的檢查，並確認沒有 console error。

#### Scenario: 全部通過
- **WHEN** dev server 在跑且執行 `npm run test:ui`
- **THEN** 輸出「全部通過」並以 0 結束
