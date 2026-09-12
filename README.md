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
| 錄得不清楚 | 卡片會用紅字提示「沒聽清楚」並停在待回答，不會自動生成。點問題文字改好按「生成回答」，或按「錄下一題」對著手機複述評審的問題再錄一次 |
| 整理結果不太確定 | 卡片會照常生成，但多一行灰字提醒；開口前先對一下問題文字和原始逐字稿 |
| 評審接著問下一題 | 按畫面最上面的「錄下一題」（一按就錄），同一顆鈕變成「停止 0:12」，上一題的答案還在底下；問完再按一次停止 |
| 麥克風出問題 | 按錄音鈕旁的鍵盤圖示，輸入框從同一排展開，打字輸入問題，Enter 送出 |
| 轉錄結果不對 | 點一下問題文字修改，再按「重新生成」 |
| 生成方向錯了 | 按「停止」，改問題後「重新生成」 |
| 想看前面的題目 | 右上角 ⋯ →「歷史」，舊題會列在最新一題下面（刪除也在這裡） |
| Q&A 結束 | 右上角 ⋯ →「結束本場」，組員的觀看頁會停止同步；紀錄仍保留在你的手機上 |

閱讀狀態永遠只顯示最新一題、字放大，方便自己邊看邊講或組員看著講。

### 上台技巧（比任何功能都重要）

1. **評審問完，先複述再停止錄音。** 對著手機說「評審的問題是⋯」，這段是你近距離的清楚聲音，就算評審那段辨識爛掉也救得回來。複述本身也讓全場知道你聽懂了，還多了幾秒思考時間。
2. **不要等畫面才開口。** 停止錄音後先講一句開場（「這個我們有想過」「關於成本這部分」），三到五秒後重點就出來了，沒有沉默。
3. **手機朝向評審、儘量靠近。** 手機麥克風對三公尺外的人聲衰減很快，這是辨識品質最大的變數。
4. **會場先錄一題試。** 看原始逐字稿還剩多少字。如果連原始稿都零散，整場就用第 1 招，每題都複述。
5. **文件比程式重要。** `data/` 沒放真實資料時，AI 只會說「我們目前沒有實際數據」。至少把 `data/templates/04-常見問題.md` 填好。

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

**流量保護**（三層）：整個系統只有觀看頁會主動打 API，主控頁只在你錄音、送出、內容變動時才送請求。

1. **結束本場**：講完後在主控頁右上角 ⋯ →「結束本場」，所有組員的觀看頁會在幾秒內收到並停止輪詢，內容仍留在畫面上。之後若再錄下一題，房間會自動重新開啟，組員點一下畫面就重新連線。
2. **閒置自動停**（忘了按結束時的後盾）：觀看頁分頁在背景就不打；10 分鐘沒新內容、沒操作就放慢到每 3 秒；30 分鐘就完全停止並顯示「閒置太久已暫停」，點一下畫面才恢復。房間代碼錯或未設定 Redis 會直接停止；連線失敗會逐步拉長重試間隔（最多 30 秒）。
3. **資料自動過期**：Redis 裡的房間資料在最後一次寫入後 6 小時自動消失。

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
