# deployment-config（delta）

## MODIFIED Requirements
- 環境變數：`APP_PASSWORD`（選填）→ `SESSION_SECRET` / `LOGIN_PASSWORD` / `ALLOWED_EMAILS`（必填，缺任一即登入停用）；新增 Scenario「缺登入設定」
- 執行環境：補 `/api/login`、`/api/logout`、`proxy.ts` 的 runtime 說明

完整條文見 `openspec/specs/deployment-config/spec.md`。
