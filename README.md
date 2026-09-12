# PitchCue · 評審 Q&A 即時提詞助手

黑客松評審提問時的即時輔助工具：錄下評審的問題 → 語音轉文字並整理成清楚的提問 → 依據你準備的專案文件產生「重點條列 + 可直接唸的口語稿」。每一題是獨立的流程，第一題還在生成時就可以錄第二題。

## 1. 準備資料

把專案資料放進 `data/`（詳見 `data/README.md`）：

- `data/*.md`：專案簡介、技術架構、商業模式、常見問題……全部會被讀進 AI 的 prompt。
- `data/glossary.txt`：一行一個專有名詞，讓語音辨識不會聽錯。

`data/example.md` 是佔位範例，放入真實資料後請刪掉。

## 2. 本機執行

```bash
cp .env.example .env.local   # 填入 OPENAI_API_KEY
npm install
npm run dev                  # 會先自動把 data/ 合併成 lib/knowledge.generated.ts
```

開 http://localhost:3000（localhost 可直接使用麥克風，不需要 HTTPS）。

## 3. 部署到 Vercel

1. 把這個 repo push 到 GitHub。
2. Vercel → Add New Project → Import 這個 repo（Framework 會自動偵測 Next.js）。
3. Settings → General → Node.js Version 選 **22.x**。
4. Settings → Environment Variables 加入：
   - `OPENAI_API_KEY`（必填）
   - `APP_PASSWORD`（建議設，避免網址外流被刷額度）
5. Deploy。之後只要 `git push`，Vercel 就會重新 build（build 時會自動重新產生知識檔）。

或用 CLI：`vercel` → 依提示操作，再到 dashboard 設定環境變數後 `vercel --prod`。

## 4. 上台流程

全程只需要一支手機。頁面有兩個狀態：**準備**（還沒有題目）和**閱讀**（有題目之後）。

| 時機 | 動作 |
|---|---|
| 上台前 | 打開網頁 → 若有密碼先輸入 → 按「準備麥克風」（允許權限，綠燈亮）→ 按「暖機」 |
| 評審開始問 | 按「開始錄音」 |
| 評審問完 | 按「停止錄音」→ 卡片出現「轉錄中」→ 1~2 秒後顯示整理好的問題，接著自動生成重點與口語稿，照著講 |
| 評審接著問下一題 | 按畫面最上面的「錄下一題」（一按就錄），同一顆鈕變成「停止 0:12」，上一題的答案還在底下；問完再按一次停止 |
| 麥克風出問題 | 按錄音鈕旁的鍵盤圖示，輸入框從同一排展開，打字輸入問題，Enter 送出 |
| 轉錄結果不對 | 點一下問題文字修改，再按「重新生成」 |
| 生成方向錯了 | 按「停止」，改問題後「重新生成」 |
| 想看前面的題目 | 右上角 ⋯ →「歷史」，舊題會列在最新一題下面（刪除也在這裡） |

閱讀狀態永遠只顯示最新一題、字放大，方便自己邊看邊講或組員看著講。

## 5. 組員即時觀看（選用）

你用手機錄音與操作，組員在自己的手機開 `/view?code=<ROOM_CODE>` 就能即時看到每題的問題與逐字串流的回答（延遲約 1 秒），畫面跟主控頁的閱讀狀態一樣。需要一個 Upstash Redis 當共用狀態：

**方法 A：Vercel Marketplace（推薦）**

```bash
vercel link              # 連到你的 Vercel 專案
vercel install upstash   # 建立 Redis，憑證自動注入 Vercel 並拉到 .env.local
```

**方法 B：手動**：到 https://console.upstash.com 建一個 Redis，把 REST URL 與 TOKEN 填成 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`（本機 `.env.local` 與 Vercel 環境變數都要）。

然後設定 `ROOM_CODE`（一串不好猜的字）。部署後在主控頁右上角 ⋯ →「組員觀看連結」→「複製」，把連結傳給組員。

沒設定 Redis 時，主控頁標題旁不會有同步圓點（綠＝已同步、紅＝同步失敗），其他功能完全不受影響。

## 6. 備援

- 會場網路連不上 Vercel：筆電上先跑好 `npm run dev`，改用 `http://localhost:3000`。
- 頁面不小心重新整理：問答紀錄存在瀏覽器裡不會消失；麥克風要重新授權，「錄下一題」上會標「需授權」，按下去先授權再錄。

## 環境變數

| 變數 | 說明 |
|---|---|
| `OPENAI_API_KEY` | 必填 |
| `APP_PASSWORD` | 選填，設定後網頁第一次呼叫 API 會要求輸入密碼 |
| `OPENAI_TRANSCRIBE_MODEL` | 預設 `gpt-transcribe` |
| `OPENAI_CLEAN_MODEL` | 預設 `gpt-5.6-luna`（整理問題用） |
| `OPENAI_CHAT_MODEL` | 預設 `gpt-5.6-terra`（生成回答用） |
| `PROMPT_CACHE_KEY` | 預設 `hackathon-qa-v1`，資料大改後可換值 |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | 選填，啟用組員即時觀看（Vercel Marketplace 注入的 `KV_REST_API_URL` / `KV_REST_API_TOKEN` 也可） |
| `ROOM_CODE` | 選填，觀看頁的房間代碼，預設 `demo` |

## 專案結構

```
data/                      專案資料（你提供）
scripts/build-knowledge.mjs  prebuild：合併 data/ → lib/knowledge.generated.ts
lib/prompts.ts             回答與問題整理的 prompt
app/api/transcribe/        錄音 → 文字 → 整理成問題
app/api/answer/            問題 + 歷史 → 串流回答
app/api/room/              組員共享：主控端寫入 / 觀看頁輪詢（Upstash Redis）
app/view/                  組員觀看頁（唯讀）
hooks/useRecorder.ts       全域唯一的錄音器
hooks/useQuestions.ts      每題獨立的 pipeline 與狀態
hooks/useRoomSync.ts       主控端 → Redis 的節流同步
components/                UI
```
# pitchcue
