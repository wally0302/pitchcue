# 單人登入系統（email + 密碼，簽名 cookie，不用 DB）

## 為什麼現在做
- 部署網址已經公開，但原本的 `APP_PASSWORD` 是「選填、沒設就放行」，而且本機與線上都沒設，等於任何人拿到網址就能刷 OpenAI 額度。
- 目前只有一位使用者（開發者本人），還不打算開放外部使用，要的是「只有名單內的 email 能登入」，不是完整帳號系統。
- ROADMAP Phase 1 才需要多帳號、magic link、DB；現在做一個零基礎設施的版本，之後可平滑升級。

## 做什麼
- 登入頁 `/login`：email + 密碼，名單 `ALLOWED_EMAILS` 與密碼 `LOGIN_PASSWORD` 放環境變數。
- Session 用 HMAC-SHA256 簽名 cookie（`SESSION_SECRET`），30 天，Node 內建 crypto，不加套件、不開 DB。
- `proxy.ts`（Next 16 的 middleware）擋主控頁與付費 API；route handler 內再檢查一次。
- 登入失敗計數放現有 Upstash Redis（10 次 / 15 分鐘 / IP），沒 Redis 就略過。
- 移除 `APP_PASSWORD`、`x-app-key`、localStorage `speak:key` 與密碼卡 UI。
- 三個登入變數缺任一個即 fail closed：沒人能登入，而不是全開。

## 不做什麼（Non-goals）
- 不做 OAuth / Google 登入、不做 magic link、不寄信。
- 不做多帳號、註冊、忘記密碼、密碼雜湊儲存（密碼本身就是環境變數）。
- 不擋 `/view` 觀看頁與 `GET /api/room`：組員仍只靠房間代碼。
- 不開 Vercel Postgres 或任何新資料庫。

## 零閒置流量
- 新增的 Redis 呼叫只在 `POST /api/login` 發生（讀計數、寫失敗、登入成功時清除），閒置時零流量。
- proxy 只驗簽名，不打任何外部服務。

## 敏感資訊
- `SESSION_SECRET`、`LOGIN_PASSWORD`、真實 email 只放 `.env.local`（gitignored）與 Vercel 環境變數；repo、README、spec 只寫變數名與範例值。
