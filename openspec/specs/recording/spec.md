# recording Specification

## Purpose
提供全場唯一的手機錄音器：麥克風授權一次整場保留，每題新建一個 MediaRecorder，錄音狀態與任何題目的轉錄或回答進度完全獨立，讓上一題還在生成時就能錄下一題。

## Requirements

### Requirement: 偵測瀏覽器支援
錄音器 SHALL 在客戶端判斷 `navigator.mediaDevices.getUserMedia` 與 `MediaRecorder` 是否存在，不支援時 `supported` 為 false，錄音鈕停用並提示改用打字輸入。

#### Scenario: 不支援的瀏覽器
- **WHEN** 瀏覽器沒有 MediaRecorder
- **THEN** 準備狀態顯示「此瀏覽器不支援錄音，請改用下方打字輸入」，錄音鈕為 disabled

### Requirement: 預先授權麥克風
`prepare()` SHALL 以 echoCancellation、noiseSuppression、autoGainControl 皆開啟的設定取得音訊 MediaStream，成功後整場保留、`ready` 為 true；若已有存活的 stream 則直接回傳成功。任一 track 結束時清掉 stream、`ready` 設為 false 並提示重新準備。

#### Scenario: 使用者允許權限
- **WHEN** 按「準備麥克風」且允許權限
- **THEN** `ready` 為 true，畫面顯示綠燈「麥克風已就緒」

#### Scenario: 使用者拒絕權限
- **WHEN** getUserMedia 拋出 NotAllowedError
- **THEN** `ready` 為 false，錯誤訊息為「麥克風權限被拒絕，請在瀏覽器網址列允許麥克風後重試」

#### Scenario: 麥克風中途中斷
- **WHEN** 系統收回音訊裝置使 track 結束
- **THEN** `ready` 為 false，錯誤訊息提示重新按「準備麥克風」

### Requirement: 開始錄音
`start()` SHALL 在沒有存活 stream 時先呼叫 `prepare()`，然後依序嘗試 `audio/webm;codecs=opus`、`audio/webm`、`audio/mp4;codecs=mp4a.40.2`、`audio/mp4`、`audio/ogg;codecs=opus`，選第一個瀏覽器支援的格式，以 48 kbps 建立新的 MediaRecorder，不傳 timeslice，開始計秒（每 250ms 更新），並嘗試取得螢幕 wake lock。已在錄音中時再次呼叫不做事。

#### Scenario: 未授權直接按錄音
- **WHEN** `ready` 為 false 時按「錄下一題」
- **THEN** 先跳出權限請求，允許後直接開始錄音

#### Scenario: Safari 不支援 webm
- **WHEN** 瀏覽器只支援 audio/mp4
- **THEN** 以 mp4 錄音，副檔名為 `m4a`

#### Scenario: 不支援 wake lock
- **WHEN** 瀏覽器沒有 `navigator.wakeLock`
- **THEN** 錄音照常進行，不拋錯

### Requirement: 停止錄音並交出音檔
`stop()` SHALL 停止計時、釋放 wake lock、停止 MediaRecorder；`onstop` 觸發時把所有 chunk 合成一個 Blob，副檔名依實際 MIME 推導（webm、m4a、ogg、wav），連同錄音時長交給 `onStop` 回呼。

#### Scenario: 正常停止
- **WHEN** 錄了 12 秒後按停止
- **THEN** `onStop` 收到一個 Blob、副檔名與約 12000ms 的時長，`recording` 為 false

### Requirement: 單鍵切換
`toggle()` SHALL 在錄音中時執行 `stop()`，否則執行 `start()`，讓同一顆按鈕負責開始與停止。

#### Scenario: 連按兩次
- **WHEN** 連續按兩次錄音鈕
- **THEN** 第一次開始錄音、第二次停止並交出音檔

### Requirement: 錄音狀態獨立於題目流程
錄音器 SHALL 不依賴任何題目的狀態；前一題仍在轉錄或生成時可以開始錄下一題。

#### Scenario: 上一題還在生成
- **WHEN** 最新一題狀態為 answering 時按「錄下一題」
- **THEN** 立即開始錄音，上一題的串流不受影響
