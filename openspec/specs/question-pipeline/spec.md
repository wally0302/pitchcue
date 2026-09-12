# question-pipeline Specification

## Purpose
主控頁上每一題的生命週期：從錄音或打字建立卡片，經轉錄、整理、自動串流回答到完成，每題是獨立流程、可中止、可修改後重新生成，並持久化在瀏覽器讓重新整理不丟失。

## Requirements

### Requirement: 題目資料模型
每題 SHALL 為 `QuestionItem`：`id`（UUID）、`seq`（遞增序號）、`createdAt`、`status`（transcribing、ready、answering、done、error 之一）、`raw`（原始逐字稿，打字輸入時沒有）、`question`（整理後可編輯的問題）、`confidence`（high、medium、low，可選）、`answer`（串流累積的 Markdown）、`error`、`phase`（轉錄或生成階段的細部提示）。

#### Scenario: 打字輸入的題目
- **WHEN** 以打字建立題目
- **THEN** `raw` 與 `confidence` 為 undefined，`status` 直接為 ready

### Requirement: 錄音建立題目並自動走完流程
`addFromAudio(blob, ext)` SHALL 立即新增一張 `transcribing`、phase「轉錄中」的卡片；音檔超過 4MB 直接標為 error「錄音檔太大（超過 4MB），請縮短錄音」；否則送 `/api/transcribe`，成功後寫入 `raw`、`question`、`confidence`，狀態改 ready，並不論信心高低立即以整理後的問題與該題序號呼叫 `answer()`。

#### Scenario: 正常錄音
- **WHEN** 停止錄音
- **THEN** 卡片先顯示「轉錄中」，約 1 到 2 秒後顯示整理後的問題，接著自動開始生成回答

#### Scenario: 辨識信心低
- **WHEN** 轉錄回傳 `confidence: low`
- **THEN** 仍自動生成回答，卡片另顯示紅字提醒對一下問題文字

#### Scenario: 轉錄失敗
- **WHEN** `/api/transcribe` 回傳非 2xx
- **THEN** 卡片狀態為 error，顯示後端的錯誤訊息，不呼叫 `answer()`

### Requirement: 打字建立題目
`addFromText(text)` SHALL 去除前後空白，空字串不建立；否則新增 ready 狀態的卡片並立即呼叫 `answer()`。

#### Scenario: 送出打字問題
- **WHEN** 在輸入框輸入問題並按 Enter
- **THEN** 新卡片成為最新一題並開始生成回答

### Requirement: 回答某一題是獨立串流
`answer(id)` SHALL 中止該題既有的串流、建立新的 AbortController，只把「已完成（done）、序號小於本題、有回答」的題目依序當作 history，把狀態設為 answering、清空 answer，逐段把串流內容累加到 `answer`，結束後設為 done。

#### Scenario: 兩題同時生成
- **WHEN** 第一題還在 answering 時第二題開始回答
- **THEN** 兩條串流各自獨立更新各自的卡片，第二題的 history 不含第一題

#### Scenario: 重新生成
- **WHEN** 對 done 的題目再按「重新生成」
- **THEN** 舊回答清空、重新串流，history 只含序號更小的已完成題目

#### Scenario: 問題為空
- **WHEN** 問題文字被清空後按生成
- **THEN** 狀態為 error「問題是空的」，不送請求

### Requirement: 中止回答
`abort(id)` SHALL 中止該題的串流；被中止的題目狀態回到 ready，保留已收到的部分回答；非中止造成的失敗則狀態為 error 並顯示訊息。

#### Scenario: 按停止
- **WHEN** answering 中按「停止」
- **THEN** 狀態回到 ready，已生成的內容仍顯示，可修改問題後重新生成

#### Scenario: 網路錯誤
- **WHEN** 串流中途連線失敗
- **THEN** 狀態為 error，錯誤訊息顯示在卡片上

### Requirement: 修改問題
`setQuestion(id, text)` SHALL 更新問題文字並清除 `confidence`，因為人改過的問題視為確定。

#### Scenario: 修正辨識錯誤
- **WHEN** 使用者點問題文字修改
- **THEN** 「辨識不太清楚」提示消失，可按「重新生成」

### Requirement: 刪除與清除
`remove(id)` SHALL 中止該題串流並移除卡片；`clear()` SHALL 中止所有串流、序號歸零、移除所有卡片。

#### Scenario: 清除本場
- **WHEN** 從選單選「清除本場」並確認
- **THEN** 所有卡片消失，頁面回到準備狀態，下一題序號從 1 開始

### Requirement: 持久化到瀏覽器
題目清單 SHALL 在每次變動時寫入 localStorage `speak:session`；載入時讀回，進行中的題目（transcribing 或 answering）若已有問題文字則改為 ready，否則改為 error「頁面重新整理，流程中斷」，並清除 phase；序號從已有題目的最大值接續。

#### Scenario: 生成中重新整理
- **WHEN** 某題 answering 時重新整理頁面
- **THEN** 該題狀態變 ready，問題與已收到的部分回答仍在，可按「重新生成」

#### Scenario: 轉錄中重新整理
- **WHEN** 某題 transcribing 且尚無問題文字時重新整理
- **THEN** 該題狀態為 error「頁面重新整理，流程中斷」

#### Scenario: localStorage 不可用
- **WHEN** 讀寫 localStorage 拋出例外
- **THEN** 功能照常運作，只是不持久化

### Requirement: 暖機
`warmup()` SHALL 對 `/api/answer` 送固定的暖機問題（history 為空）並把串流讀完，讓專案文件進入 prompt cache；暖機不建立卡片。

#### Scenario: 上台前暖機
- **WHEN** 按「暖機」
- **THEN** 按鈕顯示「暖機中…」，完成後顯示「已暖機」且停用，卡片列表沒有新題目

#### Scenario: 暖機失敗
- **WHEN** 暖機請求回傳錯誤
- **THEN** 按鈕顯示「暖機失敗，再試一次」，可再按
