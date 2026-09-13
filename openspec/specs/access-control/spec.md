# access-control Specification

## Purpose
避免部署網址外流後被刷 OpenAI 額度：主控端頁面與 API 需要登入（email + 密碼，名單放環境變數，session 是 HMAC 簽名 cookie，不用 DB）；觀看頁以房間代碼保護。登入設定缺任何一項即 fail closed，沒有「未設定就放行」。

## Requirements

### Requirement: 登入 session
`POST /api/login` 接收 JSON `{ email, password }`。email 經 trim 與小寫後 SHALL 在 `ALLOWED_EMAILS`（逗號分隔）名單內，且 password 以等時比較等於 `LOGIN_PASSWORD`，否則回傳 401 `{ error: "帳號或密碼錯誤" }`（不區分 email 或密碼哪個錯）。成功時 SHALL 設定 cookie `pitchcue_session`：值為 `base64url(payload).base64url(HMAC-SHA256(payload, SESSION_SECRET))`，payload 含 email 與 30 天後的到期時間；`HttpOnly`、`SameSite=Lax`、`Path=/`、`Max-Age` 30 天，https（或 `x-forwarded-proto: https`）時加 `Secure`。所有回應帶 `Cache-Control: no-store`。

#### Scenario: 帳密正確
- **WHEN** email 在名單內且密碼相符
- **THEN** 回傳 200 `{ ok: true, email }` 並 Set-Cookie

#### Scenario: 帳密錯誤
- **WHEN** email 不在名單或密碼不符
- **THEN** 回傳 401，不 Set-Cookie

#### Scenario: 缺登入設定（fail closed）
- **WHEN** `SESSION_SECRET`（至少 16 字元）、`LOGIN_PASSWORD`、`ALLOWED_EMAILS` 任一為空
- **THEN** 回傳 503 並說明要設定哪些變數；任何既有 cookie 也視為無效

#### Scenario: cookie 被篡改或過期
- **WHEN** 簽名不符、payload 格式錯、已過期，或 email 已不在名單
- **THEN** 視為未登入

### Requirement: 受保護路由
`proxy.ts`（Next 16 的 proxy，matcher 明列 `/`、`/login`、`/api/transcribe`、`/api/answer`、`/api/room`、`/api/room/link`）SHALL 驗證 `pitchcue_session`：沒有有效 session 時，頁面 307 導向 `/login?next=<原路徑>`，`/api/*` 回傳 401 `{ error: "unauthorized" }`；已登入者造訪 `/login` 導向 `next`（只接受站內路徑）。`GET /api/room` 不需登入（觀看頁輪詢）。`/api/transcribe`、`/api/answer`、`POST /api/room`、`GET /api/room/link` 的 route handler SHALL 另外用 `requireSession` 二次檢查，在解析 body 前回傳 401；不得只依賴 proxy。

#### Scenario: 未登入開主控頁
- **WHEN** 沒有有效 cookie 造訪 `/`
- **THEN** 307 到 `/login?next=%2F`

#### Scenario: 未登入呼叫付費 API
- **WHEN** 沒有有效 cookie 呼叫 `POST /api/answer`
- **THEN** 回傳 401，不呼叫 OpenAI 或 Redis

#### Scenario: 觀看頁不受影響
- **WHEN** 沒有 cookie 造訪 `/view` 或 `GET /api/room?code=`
- **THEN** 不經 proxy 阻擋，照原本邏輯處理

### Requirement: 登入速率限制
已設定 Upstash Redis 時，`POST /api/login` SHALL 以來源 IP（`x-forwarded-for` 第一段）計數失敗次數 `login:fail:<ip>`，15 分鐘內達 10 次即回傳 429 `{ error: "嘗試次數過多，請 15 分鐘後再試" }`；登入成功清除計數。未設定 Redis 或 Redis 出錯時 SHALL 略過限制，不阻擋登入。此檢查只在登入請求執行，閒置時不產生流量。

#### Scenario: 連續猜錯
- **WHEN** 同一 IP 15 分鐘內第 11 次送錯密碼
- **THEN** 回傳 429

### Requirement: 登出
`POST /api/logout` SHALL 以 `Max-Age=0` 清除 `pitchcue_session` 並回傳 `{ ok: true }`。主控頁選單 SHALL 提供「登出」，成功後整頁導向 `/login`。

#### Scenario: 登出後
- **WHEN** 登出後再開 `/`
- **THEN** 導向 `/login`

### Requirement: 客戶端 401 處理
客戶端所有主控端 API 呼叫 SHALL 經過 `apiFetch`（同源 fetch 自動帶 cookie）；收到 401 時整頁導向 `/login?next=<目前路徑>` 並拋出錯誤「需要登入，正在前往登入頁…」。登入頁 `/login` 為 email + 密碼表單，成功後整頁導向 `next`（只接受站內路徑，預設 `/`）。

#### Scenario: 登入過期
- **WHEN** 30 天後 cookie 過期，使用者按錄音
- **THEN** 轉到登入頁，登入後回到主控頁

### Requirement: 觀看頁房間代碼
`GET /api/room` SHALL 要求 query `code` 非空且等於 `ROOM_CODE`（預設 `demo`），否則回傳 401 `{ error: "invalid_room_code" }`；此端點不檢查登入 session，組員不需要帳號。

#### Scenario: 代碼正確
- **WHEN** `?code=` 等於 `ROOM_CODE`
- **THEN** 回傳房間快照

#### Scenario: 代碼錯誤或空白
- **WHEN** `?code=` 缺少或不符
- **THEN** 回傳 401，觀看頁顯示「房間代碼錯誤」並停止輪詢

### Requirement: 取得觀看連結需要登入
`GET /api/room/link` SHALL 套用登入檢查，回傳 `{ configured, code }`：Redis 已設定時 `code` 為 `ROOM_CODE`，否則 `code` 為 null；回應帶 `Cache-Control: no-store`。

#### Scenario: 已設定 Redis
- **WHEN** 已登入的主控端呼叫
- **THEN** 回傳 `configured: true` 與房間代碼

#### Scenario: 未設定 Redis
- **WHEN** 沒有 Upstash 憑證
- **THEN** 回傳 `configured: false, code: null`
