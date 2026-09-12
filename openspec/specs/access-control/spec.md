# access-control Specification

## Purpose
避免部署網址外流後被刷 OpenAI 額度：主控端 API 以共用密碼保護，觀看頁以房間代碼保護。兩者都是選用設定，沒設定時不影響使用。

## Requirements

### Requirement: 主控端 API 密碼
設定 `APP_PASSWORD` 時，`/api/transcribe`、`/api/answer`、`POST /api/room`、`GET /api/room/link` SHALL 要求請求標頭 `x-app-key` 等於該值，否則回傳 401 `{ error: "unauthorized" }`；未設定時全部放行。

#### Scenario: 密碼正確
- **WHEN** `x-app-key` 等於 `APP_PASSWORD`
- **THEN** 請求正常處理

#### Scenario: 密碼錯誤
- **WHEN** `x-app-key` 缺少或不符
- **THEN** 回傳 401，不呼叫 OpenAI 或 Redis

#### Scenario: 未設定密碼
- **WHEN** `APP_PASSWORD` 為空
- **THEN** 任何請求都不檢查標頭

### Requirement: 客戶端自動帶密碼並在 401 時要求輸入
客戶端所有主控端 API 呼叫 SHALL 經過 `apiFetch`：從 localStorage `speak:key` 讀出密碼放進 `x-app-key`；收到 401 時廣播 `speak:unauthorized` 事件並拋出錯誤「需要密碼：請在上方輸入密碼後按「重試」」；App 收到事件後顯示密碼輸入卡片，儲存後寫回 localStorage 並隱藏卡片。

#### Scenario: 第一次使用
- **WHEN** 部署有密碼且瀏覽器沒存過
- **THEN** 第一次錄音或送出時卡片顯示錯誤，頁面上方出現密碼輸入欄；輸入儲存後再操作即可成功

#### Scenario: 密碼已存
- **WHEN** localStorage 有正確密碼
- **THEN** 之後所有請求自動帶上，不再提示

### Requirement: 觀看頁房間代碼
`GET /api/room` SHALL 要求 query `code` 非空且等於 `ROOM_CODE`（預設 `demo`），否則回傳 401 `{ error: "invalid_room_code" }`；此端點不檢查 `APP_PASSWORD`，組員不需要主控密碼。

#### Scenario: 代碼正確
- **WHEN** `?code=` 等於 `ROOM_CODE`
- **THEN** 回傳房間快照

#### Scenario: 代碼錯誤或空白
- **WHEN** `?code=` 缺少或不符
- **THEN** 回傳 401，觀看頁顯示「房間代碼錯誤」並停止輪詢

### Requirement: 取得觀看連結需要主控密碼
`GET /api/room/link` SHALL 套用密碼檢查，回傳 `{ configured, code }`：Redis 已設定時 `code` 為 `ROOM_CODE`，否則 `code` 為 null；回應帶 `Cache-Control: no-store`。

#### Scenario: 已設定 Redis
- **WHEN** 主控端帶正確密碼呼叫
- **THEN** 回傳 `configured: true` 與房間代碼

#### Scenario: 未設定 Redis
- **WHEN** 沒有 Upstash 憑證
- **THEN** 回傳 `configured: false, code: null`
