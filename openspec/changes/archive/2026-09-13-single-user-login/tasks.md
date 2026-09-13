# Tasks（全部完成，2026-09-13）

- [x] `lib/session.ts`：簽名 / 驗證 / 憑證比對 / cookie 選項
- [x] `lib/login-limit.ts`：Redis 失敗計數
- [x] `lib/auth.ts` 改 `requireSession`，四個 route handler 換用
- [x] `app/api/login`、`app/api/logout`
- [x] `proxy.ts`
- [x] `app/login/page.tsx`、`components/LoginForm.tsx`、`globals.css`
- [x] `lib/client.ts`、`components/App.tsx`（移除舊機制、加登出）
- [x] `.env.example`、README、ROADMAP、openspec 各 spec 與 config.yaml
- [x] `scripts/smoke-ui.mjs`：登入 / 溢出 / 登出檢查
- [x] `npm run lint`、`npx tsc --noEmit`、`npm run build` 通過
- [x] `next start -p 3111` + curl：307 / 401 / 200 / 篡改 / 登出 / 429 全部符合
- [x] `npm run test:ui` 全部通過
- [x] `.env.local` 與 Vercel production / preview 設定三個變數
- [ ] Vercel production 部署（由使用者執行）
