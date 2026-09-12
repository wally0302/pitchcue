# deployment-config Specification

## Purpose
定義環境變數、執行環境與部署方式，讓本機開發、Vercel 部署與會場斷網備援都能用同一份程式碼運作。

## Requirements

### Requirement: 環境變數
系統 SHALL 支援以下環境變數：`OPENAI_API_KEY`（必填）、`APP_PASSWORD`（選填，主控端密碼）、`OPENAI_TRANSCRIBE_MODEL`（預設 `gpt-transcribe`）、`OPENAI_CLEAN_MODEL`（預設 `gpt-5.6-luna`）、`OPENAI_CHAT_MODEL`（預設 `gpt-5.6-terra`）、`PROMPT_CACHE_KEY`（預設 `hackathon-qa-v1`）、`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` 或 `KV_REST_API_URL` / `KV_REST_API_TOKEN`（選填）、`ROOM_CODE`（預設 `demo`）、`NEXT_PUBLIC_SITE_URL`（選填，自架時的站台網址）。`.env.example` SHALL 列出全部並註明用途。

#### Scenario: 只填 API key
- **WHEN** 只設定 `OPENAI_API_KEY`
- **THEN** 錄音、轉錄、回答全部可用；無密碼、無組員共享

#### Scenario: 資料大改後
- **WHEN** 更新 `PROMPT_CACHE_KEY` 的值
- **THEN** 後續請求使用新的 cache key，不會命中舊文件的快取路由

### Requirement: OpenAI 客戶端延遲建立
OpenAI 客戶端 SHALL 在第一次使用時才建立，避免 build 階段沒有環境變數就初始化失敗；缺少 API key 時拋出「缺少 OPENAI_API_KEY 環境變數」。

#### Scenario: build 階段
- **WHEN** 執行 `next build` 且沒有 `OPENAI_API_KEY`
- **THEN** build 成功，錯誤延後到第一次呼叫 API 時才發生

### Requirement: 執行環境
專案 SHALL 要求 Node.js 22，API routes 使用 Node.js runtime；`/api/transcribe` maxDuration 60 秒、`/api/answer` 120 秒、`/api/room` 30 秒。

#### Scenario: Vercel 部署
- **WHEN** Vercel 專案 Node 版本設為 22.x 且填入環境變數
- **THEN** `git push` 後自動 build，prebuild 重新產生知識檔

### Requirement: 站台 metadata
layout SHALL 設定 `lang="zh-Hant-TW"`、標題「PitchCue · 評審 Q&A 即時提詞助手」、描述、Open Graph 與 Twitter card、`themeColor #f2f2ef`；`metadataBase` 依序取 `NEXT_PUBLIC_SITE_URL`、`https://<VERCEL_PROJECT_PRODUCTION_URL>`、`http://localhost:3000`。

#### Scenario: 分享連結到社群
- **WHEN** 在 Vercel 部署的網址被貼到社群平台
- **THEN** 預覽顯示 PitchCue 標題、描述與 OG 圖片

### Requirement: 本機備援
系統 SHALL 能在筆電以 `npm run dev` 於 `http://localhost:3000` 完整運作，localhost 不需 HTTPS 即可使用麥克風；會場網路連不上 Vercel 時可切換使用。

#### Scenario: 會場斷網
- **WHEN** 手機連不上 Vercel 部署
- **THEN** 改開筆電的 localhost，錄音、轉錄、回答功能相同（仍需筆電能連 OpenAI）
