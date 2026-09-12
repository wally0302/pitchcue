# room-sync Specification

## Purpose
主控端把題目狀態單向同步到 Upstash Redis 的共享房間，供組員觀看頁讀取。寫入節流合併、狀態變更立即送、結束本場可讓觀看頁停止輪詢、資料自動過期。沒設定 Redis 時整個功能靜默關閉。

## Requirements

### Requirement: Redis 設定偵測
系統 SHALL 從 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` 或 Vercel Marketplace 注入的 `KV_REST_API_URL` / `KV_REST_API_TOKEN` 取得憑證；兩組都沒有時 `isRoomConfigured()` 為 false，`POST /api/room` 與 `GET /api/room` 回傳 503 `{ error: "room_not_configured" }`。Redis 客戶端延遲建立且關閉自動反序列化。

#### Scenario: 未設定
- **WHEN** 沒有任何 Redis 憑證
- **THEN** 主控端第一次同步收到 503 後永久關閉同步，狀態為 off，其他功能不受影響

#### Scenario: Vercel Marketplace 注入
- **WHEN** 只有 `KV_REST_API_URL` 與 `KV_REST_API_TOKEN`
- **THEN** 視為已設定

### Requirement: 房間資料結構與過期
房間 SHALL 以 `ROOM_CODE` 為鍵空間：`room:<code>:items`（hash，欄位為題目 id、值為 JSON）、`room:<code>:v`（整數版本號）、`room:<code>:closed`（旗標 "1"）。每次寫入 SHALL 在同一個 pipeline 內完成並把三個鍵的 TTL 重設為 6 小時。

#### Scenario: 最後一次寫入後 6 小時
- **WHEN** 房間 6 小時沒有任何寫入
- **THEN** 三個鍵自動消失，觀看頁讀到版本 0 與空清單

### Requirement: 套用同步 payload
`POST /api/room` SHALL 接受 JSON `{ upserts, removed, clear, close }`，四者皆空時回傳 400 `{ error: "empty" }`。處理順序：`clear` 為 true 先刪除 items；`removed` 最多 100 個 id 從 hash 移除；`upserts` 最多 50 筆，每筆經 sanitize 只保留 id、seq、createdAt、status、raw、question、answer、error、phase（id 不是字串或 seq 不是數字的丟棄）後寫入 hash；`close` 為 true 時設定 closed 旗標，否則刪除 closed 旗標；最後版本號加一並回傳 `{ v }`。

#### Scenario: 一般寫入
- **WHEN** 主控端送 `{ upserts: [Q1] }`
- **THEN** hash 有 Q1，closed 旗標被清除，版本號加一

#### Scenario: 結束本場
- **WHEN** 主控端送 `{ close: true }`
- **THEN** closed 旗標為 "1"，版本號加一，items 不變

#### Scenario: 結束後再錄下一題
- **WHEN** closed 為 "1" 後主控端送 `{ upserts: [Q2] }`
- **THEN** closed 旗標被刪除，房間自動重新開啟

#### Scenario: 多餘欄位
- **WHEN** upsert 的題目含 `confidence` 或其他未列欄位
- **THEN** 寫入 Redis 的資料不含這些欄位

#### Scenario: Redis 寫入失敗
- **WHEN** pipeline 執行拋出錯誤
- **THEN** 回傳 500 `{ error: "sync_failed" }`

### Requirement: 讀取房間快照
`readRoom(code, sinceV)` SHALL 先讀版本號與 closed 旗標；版本號等於 `sinceV` 時只回傳 `{ v, closed }` 不含 items；否則讀出 hash 全部項目，解析失敗的略過，依 seq 遞增排序後回傳 `{ v, closed, items }`。`GET /api/room` 的 `v` 參數不是數字時視為 -1。回應帶 `Cache-Control: no-store`。

#### Scenario: 沒有新內容
- **WHEN** 觀看頁帶目前版本號輪詢
- **THEN** 回應不含 items，流量最小

#### Scenario: 有新內容
- **WHEN** 版本號變了
- **THEN** 回應含完整排序後的題目清單

#### Scenario: Redis 讀取失敗
- **WHEN** mget 或 hgetall 拋出錯誤
- **THEN** 回傳 500 `{ error: "read_failed" }`

### Requirement: 主控端節流差異同步
`useRoomSync(items)` SHALL 在每次 items 變動時，以 JSON 序列化比較每題與上次成功送出的版本，變動的放入待送 upserts、消失的放入 removed；清單從非空變空時改送 `clear`。新題目、狀態或問題文字改變、刪除、清除視為緊急立即送出；其他變動（例如回答逐字累加）以 400ms 節流合併。同時只有一個請求在飛，飛行中累積的變動在完成後再排一次。成功後記錄已送版本並清掉未再變動的待送項目。

#### Scenario: 回答串流中
- **WHEN** answer 每幾十毫秒累加一次
- **THEN** 同步請求最多每 400ms 一次，且每次帶最新內容

#### Scenario: 新題出現
- **WHEN** 新增一張 transcribing 卡片
- **THEN** 立即送出，不等節流

#### Scenario: 同步失敗
- **WHEN** 請求回非 2xx（非 503）
- **THEN** 狀態為 error、記錄訊息，待送項目保留，下次變動再重送

### Requirement: 同步狀態
hook SHALL 對外提供 `state`：unknown（尚未送過）、off（後端回 503）、idle（已同步）、syncing（送出中）、error（失敗）、closed（已結束）。任何成功的一般寫入後，若期間未按結束則為 idle，否則維持 closed。

#### Scenario: 頂欄圓點
- **WHEN** state 為 idle
- **THEN** 頂欄顯示綠色圓點，title 為「組員已同步」

### Requirement: 結束本場
`closeRoom()` SHALL 先丟棄所有待送變動與排程，再送 `{ close: true }`；成功後 state 為 closed 並回傳 true；503 時關閉同步並回傳 false；其他失敗 state 為 error 並回傳 false。之後 items 再變動會自動送一般寫入，使房間重新開啟並回到 idle。

#### Scenario: 按結束本場
- **WHEN** 從選單選「結束本場」並確認
- **THEN** 觀看頁在幾秒內收到 closed 並停止輪詢，主控頁顯示「已結束：組員觀看頁會在幾秒內停止同步。」

#### Scenario: 結束時有未送出的變動
- **WHEN** 節流中還有待送 upserts 時按結束
- **THEN** 這些變動被丟棄，不會在 close 之後補送而重新打開房間

### Requirement: 主控端不產生閒置流量
主控端 SHALL 只在 items 變動時送同步請求，沒有輪詢或心跳；沒有題目變動時不打任何 API。

#### Scenario: 靜置
- **WHEN** 主控頁開著但沒有任何操作 10 分鐘
- **THEN** 這段期間沒有任何 `/api/room` 請求
