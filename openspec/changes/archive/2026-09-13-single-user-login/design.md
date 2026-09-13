# 設計

## 改動落點
| 位置 | 內容 |
|---|---|
| `lib/session.ts`（新） | `SESSION_COOKIE`、`SESSION_TTL_SEC`、`isLoginConfigured`、`allowedEmails`、`checkCredentials`（各自 sha256 後 `timingSafeEqual`，email 與密碼都算完再合併）、`signSession`、`verifySessionToken`（驗簽名、到期、email 仍在名單）、`readSession(req)`（自己解析 Cookie 標頭，proxy 與 route 共用）、`cookieOptions(req)`（https 或 `x-forwarded-proto: https` 才加 Secure）、`safeNext` |
| `lib/login-limit.ts`（新） | `clientIp`、`loginBlocked`、`recordLoginFailure`、`clearLoginFailures`；`login:fail:<ip>`，INCR + 900 秒 EXPIRE；無 Redis 或出錯一律不擋 |
| `lib/auth.ts` | `checkAuth` → `requireSession`；`checkRoomCode` 不動 |
| `proxy.ts`（新） | matcher 明列 `/`、`/login`、`/api/transcribe`、`/api/answer`、`/api/room`、`/api/room/link`；`GET /api/room` 放行；頁面 307 → `/login?next=`，API 401；已登入造訪 `/login` 導回 `next` |
| `app/api/login/route.ts`、`app/api/logout/route.ts`（新） | 503 未設定 → 400 缺欄位 → 429 被鎖 → 401 錯誤 → 200 Set-Cookie；logout `Max-Age=0` |
| `app/login/page.tsx`、`components/LoginForm.tsx`（新） | server page 只放 metadata；表單為 client，沿用 `.page` / `.card` / `.text-input` / `.btn-primary`，新增 `.login-card`、`.login-error` |
| `lib/client.ts` | `apiFetch` 401 → 整頁導向 `/login?next=`；移除 header / localStorage 邏輯 |
| `components/App.tsx` | 移除密碼卡與事件監聽；⋯ 選單加「登出」 |
| 四個 route handler | `requireSession` 在解析 body 前執行 |

## 時序
1. 使用者開 `/` → proxy 讀不到有效 cookie → 307 `/login?next=%2F`。
2. 表單 `POST /api/login` → 驗證 → `Set-Cookie: pitchcue_session=<payload>.<sig>` → 客戶端 `window.location.assign(next)`（整頁跳轉，讓 proxy 重新看到 cookie，並清掉客戶端狀態；`next` 只接受站內路徑）。
3. 之後每個付費 API：proxy 驗一次、route 內 `requireSession` 再驗一次；任一失敗 401 → `apiFetch` 整頁導向登入頁。
4. 登出：`POST /api/logout` 清 cookie → 導向 `/login`。

## Next 16 注意
- 檔名 `proxy.ts`、export 名 `proxy`；不可 export `runtime`。
- `NextResponse.redirect` 要絕對 URL（`new URL(path, req.url)`）。
- 登入頁不呼叫 `cookies()`（可靜態輸出）；`next` 由 `window.location.search` 讀，避免 `useSearchParams` 需要 Suspense。
- 客戶端刻意用 `window.location.assign` 而非 `router.push`，lint 規則以絕對 URL 規避並加註解。

## 對 prompt cache 的影響
無：不改 prompt。
