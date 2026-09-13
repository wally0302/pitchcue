# AWS 架構與技術決策

## 一句話：全 Serverless，沒有一台伺服器要管

八個 AWS 服務、四支 Lambda，全部按用量計價。承辦人在瀏覽器上做決定，AWS 上沒有常駐主機。部署在 us-east-1，用三支可重複執行的 boto3 腳本建起來，沒有 CDK。

## 用了哪些服務、各做什麼

```
承辦人瀏覽器
  → CloudFront（前面掛 WAF，預設 Block，只放行白名單 IP）
  → 用 OAC 讀私有 S3 網站桶（前端靜態檔）
瀏覽器 XHR 直接打 API Gateway（HTTP API，一條 ANY /{proxy+} 全接）
  → appeal-api Lambda（15 秒／1024 MB，只做路由）
     → 非同步 Invoke appeal-worker（15 分鐘／2048 MB，真正跑五個階段）
        → Bedrock（判斷與寫作、向量）
        → OpenSearch Serverless（兩個索引，混合檢索）
        → S3 資料桶（卷證、決定書 PDF、設定表、建庫報告）
        → DynamoDB appeal-cases（案件狀態、階段結果、稽核）
  → appeal-admin Lambda（30 秒／512 MB，/admin/* 管理端點）
appeal-ingest Lambda（15 分鐘／2048 MB，建語料庫，只在匯入時跑）
```

| 服務 | 角色 |
|---|---|
| CloudFront + WAF | 前端 CDN；WAF WebACL 預設 Block，IPSet 放行 4 個 IP |
| S3 兩個桶 | 網站桶完全私有，Block Public Access 四項全開，由 CloudFront OAC 讀；資料桶放 corpus、cases、drafts、config、reports |
| API Gateway HTTP API | 一條路由全接，CORS 開；上傳下載走 presigned URL，位元組不經過 API Gateway |
| Lambda × 4 | api 路由、worker 跑階段、admin 管理、ingest 建庫；共用一個 Layer（PyMuPDF、opensearch-py、requests-aws4auth、我們的 common 模組） |
| Bedrock | Claude Sonnet 4.5 判斷與寫作、Claude Haiku 4.5 便宜小任務、Titan Text Embeddings v2 向量 |
| OpenSearch Serverless | 向量型 collection，兩個索引 law-articles 886 筆、case-reasons 427 筆；0 到 4 OCU |
| DynamoDB | 單表 appeal-cases，PK 案號、SK 類型；On-demand |
| CloudWatch Logs | 每階段每步都印時間與結果，出錯先看這裡 |

## 為什麼一定要非同步

三個逾時上限決定了整個設計：API Gateway HTTP API 的整合逾時是 30 秒，官方標示不可調高；appeal-api 刻意壓在 15 秒；appeal-worker 是 Lambda 上限 15 分鐘。階段三檢索要 60 到 90 秒、階段四寫草稿 30 到 45 秒，都超過 30 秒。所以跑階段的 API 立刻回 202 並用 InvocationType=Event 非同步叫 worker，前端每 2 到 3 秒輪詢狀態。唯一真的在 appeal-api 裡做事的端點是排決定書 PDF，冷啟動 3.3 秒、熱 0.7 秒。

## 模型選擇

主判斷（階段一抽欄位、階段二抽主張配爭點、階段四寫草稿）用 Claude Sonnet 4.5，便宜小任務（摘要、分類、查詢改寫）用 Claude Haiku 4.5，向量用 Titan Text Embeddings v2（1024 維）。全程 temperature 0，因為行政處分的用字要可重現。模型 ID 要用 us. 開頭的 inference profile。

誠實說：我們沒有做過模型並排評測，選 Sonnet 4.5 是基於繁體中文法律文書生成品質的判斷，不是數據。每次呼叫實際用的模型都記錄在 ai_calls，換模型只要改環境變數。計畫是用保留的 114 年決定書當測試集做比較。

## 刻意不用的服務與理由

| 服務 | 為什麼不用 |
|---|---|
| Step Functions | 所有動作都在同一支 Lambda 用 action 分流，用它只是「照順序呼叫同一個 Lambda 六次」，for 迴圈就夠。而且五階段之間要人工確認才往下，本來就不是自動流程。錯誤訊息也清楚得多，Step Functions 會把「上一步沒執行」報成看不懂的 JSONPath 錯誤 |
| SQS / EventBridge | 只有一個非同步交棒（api 到 worker），Lambda Event 呼叫就解決。加佇列多一層要監控的東西 |
| RDS / Aurora | 沒有關聯查詢需求，案件狀態是「一個案號讀一整包」，單表最快最便宜 |
| ECS / EC2 | 沒有常駐需求，最長工作 15 分鐘內跑完 |
| Textract | 141 份 PDF 全部有文字層（實測），PyMuPDF 抽得出來；而且 Textract 不支援中文。OCR 是多花錢又多一層誤差 |
| Bedrock Knowledge Base | 混合檢索比例寫死不能調。法律文字滿是條號、期間、法規名，我們需要自己控制 BM25 與向量的門檻 |
| Cognito | 設計了但比賽期間沒建，改用 WAF IP 白名單擋前端。加上去後端程式不用改，因為程式已經在讀 JWT claims 的位置，現在只是讀不到退回預設值 |
| VPC | 會拖慢冷啟動，沒有私有網路需求 |

## Bedrock 每秒 1 個請求的規則

比賽規定 Bedrock 請求限制在每秒 1 個以下。誠實說，程式原本是違規的，09-12 實測約 39 RPS。修正方式是 common/bedrock.py 的全域鎖，在持有鎖的狀態下 sleep，強制兩次呼叫至少間隔 1 秒；embed 的並行數從 4 降到 1。

這個限制有一個破口：限流是每個 Lambda 執行實例各自算的，worker 跑案件同時 ingest 在建庫，帳號層級就是 2 RPS。目前靠紀律：比賽期間不同時跑建庫和案件，state.can_run() 也擋住同一階段 running 時重跑。真要保證需要跨實例共用計數器（DynamoDB 條件寫入），每次呼叫多一次往返，比賽規模不值得。

代價是慢：建庫循序 1 筆/秒，1,313 筆約 22 分鐘，超過 Lambda 15 分鐘，所以分類別跑，逾時會自動收工回傳 next_offset 續跑。案件流程限流後每件約 2.5 分鐘。

## OpenSearch Serverless 踩過的坑

- 中文一定要 cjk analyzer 做 bigram，漏掉不會報錯但 BM25 完全查不到東西。
- 寫入不能帶自訂 _id，重跑一次 load 會整份重複，實際踩過函釋 10 筆變 20 筆。所以更新要靠刪除加重建。
- 不支援 _refresh、_delete_by_query、_cat，呼叫拿到訊息空白的 404。寫完要等 12 秒它自己重整。
- min OCU 一定要設 0，留預設值會 24 小時算錢，一個月約 US$345。代價是閒置 10 分鐘後降到 0 OCU，第一次查詢要等 30 秒以上，所以示範前 15 分鐘要打 /admin/warmup。
- IAM 給了權限還不夠，AOSS 的 data access policy 也要包含那個角色，兩套獨立，最容易漏。
- bulk 一次 50 筆約 650 KB，750 KB 就 ConnectionTimeout。

## 安全現況（誠實版）

做到的：兩個 S3 桶都私有，直接打 S3 網址回 403，符合比賽「不建公開 bucket」的規定；前端由 WAF IP 白名單保護；API 網址與憑證不進 git；DynamoDB 每一步寫稽核紀錄；presigned URL 上傳下載。

沒做到的：API Gateway 目前沒有任何認證，網址等於憑證，知道網址的人能建案件、跑階段、讀卷證、燒 Bedrock 額度。WAF 擋不到這條線，因為瀏覽器直接打 API Gateway 不經 CloudFront，而且 HTTP API 不能掛 WAF。前端登入頁是純前端示意，三個寫死的使用者。GUARDRAIL_ID 沒設。收斂方式最快是 API Key，正規是 Cognito JWT authorizer。

## 怎麼部署

沒有 CDK、SAM 或 Terraform，是三支可重複執行的 Python 腳本：provision_aoss.py 建 OpenSearch collection 與三個政策、provision_apigw.py 建 API Gateway、provision_web.py 建 CloudFront、OAC、WAF。deploy_lambdas.py 會自動偵測 common 有沒有改、重建 Layer、發布新版本並把四支函式都指到新版。換區域只要改環境變數重跑。

## 可觀測性

CloudWatch Logs 每一階段每一步都印：哪一階段、哪一步、花多久、結果是什麼。每次 AI 呼叫記錄模型、token 進出、毫秒數在 ai_calls。出錯先看 log，訊息裡會寫是哪一階段哪一步。

## 這份文件範圍外，不要延伸

- 不要說用了 Step Functions、SQS、EventBridge、Textract、Kendra、Bedrock Knowledge Base。
- 不要說有 S3 Object Lock、Versioning WORM、EventBridge 增量更新、1,000 個 Lambda 平行、CloudTrail 告警；那是早期簡報的規劃。
- 不要說 Cognito 已建或 API 有認證。
- 不要說 Claude 3.5、Nova；主判斷是 Sonnet 4.5。
- 不要給總成本數字。
