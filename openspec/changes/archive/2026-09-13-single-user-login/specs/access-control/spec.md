# access-control（delta）

## REMOVED Requirements
### Requirement: 主控端 API 密碼
**Reason**: 「選填、未設定即放行」讓線上部署全開；改為登入 session 且 fail closed。
### Requirement: 客戶端自動帶密碼並在 401 時要求輸入
**Reason**: `x-app-key` 與 localStorage 密碼隨舊機制移除。

## ADDED Requirements
- 登入 session
- 受保護路由
- 登入速率限制
- 登出
- 客戶端 401 處理

## MODIFIED Requirements
- 觀看頁房間代碼（「不檢查 `APP_PASSWORD`」→「不檢查登入 session」）
- 取得觀看連結需要主控密碼 → 取得觀看連結需要登入

完整條文見 `openspec/specs/access-control/spec.md`。
