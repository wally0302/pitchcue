# knowledge-base Specification

## Purpose
把使用者放在 `data/` 的專案文件與專有名詞表，在 build 階段合併成固定的知識檔，作為回答生成的唯一資料來源與語音辨識的名詞提示。內容固定不變，才能命中 OpenAI prompt cache。

## Requirements

### Requirement: 合併專案文件為知識檔
系統 SHALL 在 `predev` 與 `prebuild` 階段執行 `scripts/build-knowledge.mjs`，把 `data/` 根目錄下的 `*.md`、`*.markdown`、`*.txt` 檔案（排除 `README.md` 與 `glossary.txt`）依檔名以 `zh-Hant-TW` 語系、數字感知的方式排序後，每份包成 `<document name="檔名">…</document>` 區塊，寫入 `lib/knowledge.generated.ts` 的 `KNOWLEDGE_MD` 常數，並同時輸出 `KNOWLEDGE_FILES` 檔名清單。

#### Scenario: 多份編號文件
- **WHEN** `data/` 內有 `01-專案簡介.md`、`02-技術架構.md`、`10-其他.md`
- **THEN** 知識檔依 01、02、10 的順序串接，每份都包在含檔名的 `<document>` 標籤內

#### Scenario: 子資料夾不納入
- **WHEN** `data/templates/` 內有範本檔
- **THEN** 這些檔案不會被讀進知識檔

#### Scenario: data 目錄不存在
- **WHEN** 專案沒有 `data/` 目錄
- **THEN** 腳本仍成功產出知識檔，`KNOWLEDGE_MD` 為空字串、`KNOWLEDGE_FILES` 為空陣列

### Requirement: 產生專有名詞表
系統 SHALL 讀取 `data/glossary.txt`，每行一個詞，去除前後空白，忽略空行與以 `#` 開頭的行，輸出到 `GLOSSARY_TERMS` 陣列。

#### Scenario: 含註解與空行
- **WHEN** `glossary.txt` 內容為「# 註解」「PitchCue」「」「Upstash」
- **THEN** `GLOSSARY_TERMS` 為 `["PitchCue", "Upstash"]`

#### Scenario: 沒有名詞表
- **WHEN** `data/glossary.txt` 不存在
- **THEN** `GLOSSARY_TERMS` 為空陣列，轉錄與整理 prompt 不加名詞提示

### Requirement: 提醒尚未放入真實資料
系統 SHALL 在知識檔只有範例文件（沒有任何文件，或只有 `example.md`）時，於 build 輸出中印出警告，提醒使用者把 `data/templates/` 複製出來填寫。

#### Scenario: 只有 example.md
- **WHEN** `data/` 內只有 `example.md` 與 `README.md`
- **THEN** 腳本印出「data/ 只有範例文件」的警告，但 build 仍成功

### Requirement: 知識檔不進版本控制且不可手動編輯
產出的 `lib/knowledge.generated.ts` SHALL 標示為自動產生檔，並在每次 dev 或 build 前重新產生，使 `data/` 的修改不需手動同步。

#### Scenario: 修改資料後重新啟動
- **WHEN** 使用者修改 `data/04-常見問題.md` 後執行 `npm run dev`
- **THEN** 知識檔內容反映最新文件，不需額外指令
