// UI smoke test：用本機 Chrome（headless）打開頁面，確認不會壞。
// 用法：先跑 `npm run dev` 或 `npm start`，再 `npm run test:ui`（可用 BASE_URL 指定其他 port）。
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9337;
const profile = mkdtempSync(join(tmpdir(), "speak-smoke-"));
const chrome = spawn(
  CHROME,
  ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"],
  { stdio: "ignore" }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

// evaluate 丟例外時也要把 Chrome 關掉，不然下次跑會接到這隻殘留的（連同它的 localStorage）
process.on("uncaughtException", (e) => {
  console.error(e);
  chrome.once("exit", () => {
    rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
    process.exit(1);
  });
  chrome.kill();
});

let ver;
for (let i = 0; i < 40 && !ver; i++) {
  try {
    ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  } catch {
    await sleep(250);
  }
}
if (!ver) {
  console.error("Chrome 沒起來，請確認 CHROME_PATH");
  process.exit(1);
}

const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let msgId = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
  if (m.method === "Runtime.exceptionThrown") consoleErrors.push(m.params.exceptionDetails.text);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((r) => {
    const id = ++msgId;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
const { result: { sessionId: s } } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, s);
await send("Runtime.enable", {}, s);
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, s);

const evaluate = async (expression) => {
  const { result } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, s);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
// App 是 ssr:false 的客戶端元件，dev server 重新編譯時可能要好幾秒才掛上，等到畫面真的出來再往下跑
const goto = async (path) => {
  await send("Page.navigate", { url: BASE + path }, s);
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    if (await evaluate(`!!document.querySelector('.prep, .actionbar, .page-reading, .login-card, .card .text-input')`)) break;
  }
  await sleep(300);
};

const seed = [
  {
    id: "a",
    seq: 1,
    createdAt: 1,
    status: "done",
    question: "第一題",
    answer: "## 重點\n- 重點一\n- 重點二\n\n## 口語稿\n這是口語稿。",
  },
  { id: "b", seq: 2, createdAt: 2, status: "ready", question: "第二題", answer: "", confidence: "low" },
];

// 登入：憑證來自環境變數，沒給就從 .env.local 撈（簡單的 KEY=VALUE 解析，不加依賴）
function envLocal(key) {
  try {
    const m = readFileSync(new URL("../.env.local", import.meta.url), "utf8").match(new RegExp(`^${key}=\\s*"?([^"\\n]*)`, "m"));
    return m?.[1]?.trim();
  } catch {
    return undefined;
  }
}
const EMAIL = process.env.SMOKE_EMAIL ?? (process.env.ALLOWED_EMAILS ?? envLocal("ALLOWED_EMAILS") ?? "").split(",")[0].trim();
const PASSWORD = process.env.LOGIN_PASSWORD ?? envLocal("LOGIN_PASSWORD");
if (!EMAIL || !PASSWORD) {
  console.error("缺登入憑證：請設 ALLOWED_EMAILS / LOGIN_PASSWORD（環境變數或 .env.local）");
  process.exit(1);
}
const login = (email, password) =>
  evaluate(`fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify({ email, password }))} }).then(r => r.status)`);

await goto("/");
check("未登入：主控頁導向登入頁", await evaluate(`location.pathname === '/login' && !!document.querySelector('.login-card')`));
check(
  "登入頁：手機寬度沒有水平溢出",
  await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`),
  await evaluate(`document.documentElement.scrollWidth + ' > ' + window.innerWidth`)
);
check("登入：密碼錯誤回 401", (await login(EMAIL, "wrong-" + Date.now())) === 401);
check("登入：正確憑證回 200", (await login(EMAIL, PASSWORD)) === 200);
await goto("/login");
check("已登入：登入頁導回主控頁", await evaluate(`location.pathname === '/'`));

// 主控頁：準備狀態（沒有題目）
await goto("/");
check("準備狀態：大顆錄音鈕", await evaluate(`!!document.querySelector('.prep .btn-record')`));
check("準備狀態：說明文案", await evaluate(`!!document.querySelector('.prep .empty')`));
check("準備狀態：沒有頂端操作列", await evaluate(`!document.querySelector('.actionbar')`));
check("沒有自動回答開關", await evaluate(`!document.querySelector('input[type=checkbox]')`));
check(
  "手機寬度沒有水平溢出",
  await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`),
  await evaluate(`document.documentElement.scrollWidth + ' > ' + window.innerWidth`)
);

// 主控頁：閱讀狀態（有題目）
await evaluate(`localStorage.setItem("speak:session", ${JSON.stringify(JSON.stringify(seed))})`);
await goto("/");
check("閱讀狀態：準備區消失", await evaluate(`!document.querySelector('.prep')`));
check("閱讀狀態：一次顯示所有題目", (await evaluate(`document.querySelectorAll('.card').length`)) === 2);
check("最新一題有紅頭線、內容正確", await evaluate(`
  const c = document.querySelector('.card-latest');
  c && !!c.querySelector('.card-body') && c.textContent.includes('第二題')
`));
check("閱讀狀態：頂端操作列有錄音鈕與鍵盤鈕", await evaluate(`!!document.querySelector('.actionbar .btn-record') && !!document.querySelector('.actionbar .key-btn')`));
check("錄音鈕在畫面上方、夠大、貼著頂欄", await evaluate(`
  const r = document.querySelector('.actionbar .btn-record').getBoundingClientRect();
  const tb = document.querySelector(".topbar").getBoundingClientRect();
  r.height >= 48 && r.top >= tb.bottom && r.top < 120 && r.width >= window.innerWidth * 0.6
`));
check("錄音鈕往下捲後仍固定在頂端", await evaluate(`
  (() => {
    window.scrollTo(0, 600);
    return new Promise(r => setTimeout(r, 100)).then(() => {
      const r = document.querySelector('.actionbar .btn-record').getBoundingClientRect();
      window.scrollTo(0, 0);
      return r.top >= 0 && r.top < 80;
    });
  })()
`));
check("沒有右下角浮動鈕", await evaluate(`!document.querySelector('.dock, .fab, .recbar')`));
check("沒有鍵盤提示標籤", await evaluate(`!document.querySelector('.kbd')`));
check("問題文字是靜態的，點一下才可編輯", await evaluate(`
  (() => {
    const b = document.querySelector('.card-latest .question-tap');
    if (!b) return false;
    b.click();
    return new Promise(r => setTimeout(r, 100)).then(() => {
      const ta = document.querySelector('.card-latest textarea.question-input');
      return !!ta && ta.value === '第二題';
    });
  })()
`));
check("ready 狀態顯示「生成回答」", await evaluate(`
  const btn = document.querySelector('.card-latest .btn-secondary'); !!btn && !btn.disabled && btn.textContent.includes('生成回答')
`));
check("聽不清楚（confidence=low）的題目顯示紅字提醒（但不阻擋生成）", await evaluate(`!!document.querySelector('.card-latest .hint-warn')`));

// 歷史永遠全部展開：一進來就看到所有題目的完整內容，沒有收起功能
check("歷史一律全部展開（舊題也有內容區、標題不是按鈕）", await evaluate(`
  document.querySelectorAll('.card').length === 2 &&
  [...document.querySelectorAll('.card:not(.card-latest)')].every(c => !!c.querySelector('.card-body')) &&
  ![...document.querySelectorAll('.card-seq')].some(el => el.tagName === 'BUTTON')
`));
await evaluate(`document.querySelector('.menu-btn').click()`);
await sleep(100);
check("選單有組員觀看連結／清除本場，沒有收起歷史", await evaluate(`
  const t = [...document.querySelectorAll('.menu-item')].map(b => b.textContent);
  !t.includes('收起歷史') && !t.includes('歷史') && t.includes('組員觀看連結') && t.includes('清除本場')
`));
// 有設 Redis 時（同步圓點亮著）選單才會有「結束本場」
check("同步啟用時選單有結束本場", await evaluate(`
  (() => {
    const synced = !!document.querySelector('.topbar .dot-live');
    const labels = [...document.querySelectorAll('.menu-item')].map(b => b.textContent);
    return synced ? labels.includes('結束本場') : !labels.includes('結束本場');
  })()
`));
await evaluate(`document.body.click()`);
await sleep(100);
check("舊題不用點就看到螢光筆重點與口語稿", await evaluate(`
  document.querySelectorAll('.card:not(.card-latest) .answer .mark').length === 2 &&
  document.querySelector('.card:not(.card-latest) .answer p')?.textContent === '這是口語稿。'
`));
check("只有歷史裡的舊題有刪除鈕", await evaluate(`
  !document.querySelector('.card-latest .btn-text') &&
  !!document.querySelector('.card:not(.card-latest) .btn-text')
`));

// 鍵盤鈕 → 操作列底下展開輸入框 → 送出新題
await evaluate(`document.querySelector('.key-btn').click()`);
await sleep(100);
check("鍵盤鈕在操作列底下打開輸入框", await evaluate(`!!document.querySelector('.actionbar .sheet textarea')`));
await evaluate(`
  const input = document.querySelector('.sheet textarea');
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  setter.call(input, '第三題');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
`);
await sleep(300);
check("送出後輸入框關閉、第三題成為最新", await evaluate(`
  !document.querySelector('.sheet') && document.querySelector('.card-latest').textContent.includes('第三題')
`));
check("前一題移到歷史且仍然展開", await evaluate(`
  (() => {
    const c = [...document.querySelectorAll('.card:not(.card-latest)')].find(c => c.textContent.includes('第二題'));
    return !!c && !!c.querySelector('.card-body');
  })()
`));
check(
  "有資料時手機寬度沒有水平溢出",
  await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`)
);

// 觀看頁
await goto("/view");
check("觀看頁：房間代碼表單", await evaluate(`!!document.querySelector('.card .text-input')`));
await goto("/view?code=smoke-test");
check("觀看頁：有代碼時顯示連線狀態", await evaluate(`!!document.querySelector('.topbar .status')`));
check("觀看頁：也有 ⋯ 選單", await evaluate(`!!document.querySelector('.topbar .menu-btn')`));

// 流量保護：代碼錯（401）打一次就停，不會每秒繼續打
// （dev 模式 React StrictMode 會把 effect 掛兩次，所以開頭最多 2 次；重點是之後不再增加）
const roomCalls = () => evaluate(`performance.getEntriesByType('resource').filter(e => e.name.includes('/api/room')).length`);
const callsAfterFirst = await roomCalls();
await sleep(3000);
const callsLater = await roomCalls();
check("觀看頁：代碼錯誤顯示提示", await evaluate(`document.querySelector('.topbar .status').textContent.includes('房間代碼錯誤')`));
check(
  "觀看頁：代碼錯誤後不再輪詢",
  callsAfterFirst >= 1 && callsAfterFirst <= 2 && callsLater === callsAfterFirst,
  `first=${callsAfterFirst} later=${callsLater}`
);

// 正確代碼（沒設 ROOM_CODE 時預設 demo）：要持續輪詢，約每秒一次
// 先把房間清空並打開（上一輪測試收尾會把房間關掉）；沒設 Redis 時後端回 503，後面跟 Redis 有關的檢查略過
const post = (body) =>
  evaluate(`fetch('/api/room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(body))} }).then(r => r.status)`);
const roomStatus = await post({ clear: true });
await goto("/view?code=" + encodeURIComponent(process.env.ROOM_CODE ?? "demo"));
await sleep(500); // 等新頁面真的載入（goto 的選擇器可能先對到舊頁面）
const before = await roomCalls();
await sleep(4000);
const delta = (await roomCalls()) - before;
const liveStatus = await evaluate(`document.querySelector('.topbar .status').textContent`);
if (roomStatus === 503) {
  console.log("skip 觀看頁輪詢／結束本場（未設定 Redis）");
} else {
  check("觀看頁：正確代碼持續輪詢（4 秒內 2～5 次）", delta >= 2 && delta <= 5, `delta=${delta} status=${liveStatus}`);

  // 結束本場：主控端 POST close → 觀看頁停止輪詢，內容留在畫面上；主控端再寫入 + 點畫面 → 重新連線
  await post({ upserts: [seed[0]] });
  await sleep(2000);
  check("觀看頁：收到主控端寫入的題目", await evaluate(`document.body.textContent.includes('第一題')`));
  check("主控端：close 回 200", (await post({ close: true })) === 200);
  await sleep(2500);
  const closedCalls = await roomCalls();
  check("觀看頁：收到結束後顯示提示、內容仍在", await evaluate(`
    document.querySelector('.topbar .status').textContent.includes('已結束') && document.body.textContent.includes('第一題')
  `));
  await sleep(3000);
  check("觀看頁：結束後不再輪詢", (await roomCalls()) === closedCalls, `before=${closedCalls} after=${await roomCalls()}`);
  await post({ upserts: [seed[1]] }); // 主控端再錄一題 → 房間自動重開
  await evaluate(`window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); 'ok'`);
  await sleep(2000);
  check("觀看頁：點畫面後重新連線並看到新題", await evaluate(`
    document.querySelector('.topbar .status').textContent.includes('即時同步中') && document.body.textContent.includes('第二題')
  `));
  await post({ clear: true, close: true }); // 收尾：清空測試資料並關閉房間
}

// 登出：cookie 清掉後主控頁又回到登入頁
check("登出：回 200", (await evaluate(`fetch('/api/logout', { method: 'POST' }).then(r => r.status)`)) === 200);
await goto("/");
check("登出後：主控頁導向登入頁", await evaluate(`location.pathname === '/login'`));

check("沒有 console error / 未捕捉例外", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

ws.close();
// 等 Chrome 真的結束再刪 profile，否則會撞到它還在寫檔
await new Promise((r) => {
  chrome.once("exit", r);
  chrome.kill();
});
rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
console.log(failures ? `\n${failures} 項失敗` : "\n全部通過");
process.exit(failures ? 1 : 0);
