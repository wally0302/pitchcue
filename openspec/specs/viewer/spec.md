# viewer Specification

## Purpose
組員在自己手機開 `/view?code=<ROOM_CODE>` 唯讀觀看主控端的每題問題與串流回答，畫面與主控頁的閱讀狀態相同。這是整個系統唯一會主動輪詢的地方，因此必須嚴格控制閒置流量。

## Requirements

### Requirement: 房間代碼輸入
沒有 `code` query 時 SHALL 顯示代碼輸入表單（輸入框、「進入」鈕，Enter 可送出）；送出後把 `code` 寫進 URL（replaceState）並開始連線。

#### Scenario: 直接開 /view
- **WHEN** URL 沒有 code
- **THEN** 顯示「輸入房間代碼」表單，不打任何 API

#### Scenario: 輸入代碼
- **WHEN** 輸入「abc」並按進入
- **THEN** URL 變成 `/view?code=abc`，狀態為「連線中…」並開始輪詢

### Requirement: 唯讀閱讀畫面
觀看頁 SHALL 以 readOnly 模式渲染 Stage：最新一題在上、歷史全部展開、沒有編輯、生成、停止、刪除按鈕；沒有題目時顯示「等待主控端開始錄音。評審的問題和生成的回答會即時出現在這裡。」

#### Scenario: 收到題目
- **WHEN** 房間有 Q1、Q2
- **THEN** Q2 為最新一題，Q1 在歷史，皆無操作按鈕

### Requirement: 增量輪詢
連線後 SHALL 以 setTimeout 鏈輪詢 `GET /api/room?code=<code>&v=<lastV>`，帶 `cache: no-store`，同時最多一個請求在飛。回應版本號不同時更新版本、items 與「最近有新內容」時間；每次成功後重新排程，正常間隔 1 秒。

#### Scenario: 回答串流中
- **WHEN** 主控端每 400ms 寫入一次
- **THEN** 觀看頁每秒更新一次畫面，延遲約 1 秒

#### Scenario: 無新內容
- **WHEN** 回應版本號等於上次
- **THEN** 不更新畫面，繼續排程

### Requirement: 連線狀態顯示
頂欄 SHALL 顯示狀態：connecting「連線中…」、live「即時同步中」（綠點）、retrying「連線中斷，重試中…」、unauthorized「房間代碼錯誤」、off「主控端尚未啟用共享」、paused「閒置太久已暫停，點一下畫面繼續」、closed「主控端已結束本場（點一下畫面可重新連線）」；title 顯示「更新於 n 秒前」。unauthorized 時 ⋯ 選單提供「重新輸入代碼」。

#### Scenario: 代碼錯誤
- **WHEN** 後端回 401
- **THEN** 狀態為「房間代碼錯誤」，選單出現「重新輸入代碼」

### Requirement: 永久停止的錯誤
收到 401 或 503 時 SHALL 永久停止輪詢（halted），只有更換代碼或重新整理才會重來。

#### Scenario: 代碼錯誤後不再打
- **WHEN** 第一次輪詢回 401
- **THEN** 之後 3 秒內 `/api/room` 請求數不再增加

#### Scenario: 主控端未設定 Redis
- **WHEN** 第一次輪詢回 503
- **THEN** 顯示「主控端尚未啟用共享」並停止輪詢

### Requirement: 連線失敗指數退避
非 401/503 的失敗（網路錯誤、5xx）SHALL 以 1s、2s、4s… 指數退避重試，上限 30 秒；成功後失敗計數歸零。

#### Scenario: 連續失敗
- **WHEN** 連續三次請求失敗
- **THEN** 間隔依序為 2s、4s、8s，狀態顯示「連線中斷，重試中…」

### Requirement: 背景分頁不輪詢
分頁在背景（`document.hidden`）時 SHALL 不發請求；回到前景時立即抓一次並恢復排程。

#### Scenario: 切到其他 app
- **WHEN** 分頁進入背景 5 分鐘
- **THEN** 這段期間沒有任何請求；回前景後立即請求一次

### Requirement: 閒置放慢與停止
以「最近一次有新內容或使用者操作」為基準：閒置達 10 分鐘 SHALL 把間隔放慢到 3 秒；達 30 分鐘 SHALL 完全停止排程並顯示 paused。使用者點畫面或按鍵視為操作，重置閒置計時；若正處於慢速或暫停則立即抓一次並回到 1 秒間隔。

#### Scenario: 10 分鐘沒新內容
- **WHEN** 房間 10 分鐘沒有版本變動、使用者沒操作
- **THEN** 輪詢間隔變為 3 秒

#### Scenario: 30 分鐘沒新內容
- **WHEN** 閒置達 30 分鐘
- **THEN** 停止輪詢，顯示「閒置太久已暫停，點一下畫面繼續」

#### Scenario: 暫停後點畫面
- **WHEN** paused 狀態下點畫面
- **THEN** 立即請求一次並恢復 1 秒間隔

### Requirement: 主控端結束本場
回應 `closed` 為 true 時 SHALL 保留畫面上的內容、顯示 closed 狀態並停止輪詢；使用者點畫面可重新連線，若主控端已再寫入則房間已重開並顯示新題。

#### Scenario: 收到結束
- **WHEN** 主控端送 close
- **THEN** 觀看頁幾秒內顯示「主控端已結束本場」，內容仍在，之後不再有請求

#### Scenario: 結束後主控端再錄一題
- **WHEN** 主控端寫入新題、組員點畫面
- **THEN** 狀態回到「即時同步中」並看到新題

### Requirement: 卸載即停
元件卸載或代碼變更時 SHALL 清除排程與事件監聽，飛行中的回應不再更新狀態。

#### Scenario: 關閉分頁前切換代碼
- **WHEN** 從選單重新輸入代碼
- **THEN** 舊代碼的輪詢停止，新代碼從版本 -1 重新開始
