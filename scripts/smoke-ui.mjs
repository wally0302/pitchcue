// UI smoke test：用本機 Chrome（headless）打開頁面，確認不會壞。
// 用法：先跑 `npm run dev` 或 `npm start`，再 `npm run test:ui`（可用 BASE_URL 指定其他 port）。
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
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
    if (await evaluate(`!!document.querySelector('.prep, .actionbar, .viewer, form')`)) break;
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
  { id: "b", seq: 2, createdAt: 2, status: "ready", question: "第二題", answer: "" },
];

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
check("最新一題有紅頭線、展開、內容正確", await evaluate(`
  const c = document.querySelector('.card-latest');
  c && c.querySelector('.card-seq').getAttribute('aria-expanded') === 'true' && c.textContent.includes('第二題')
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

// 歷史預設展開：一進來就看到所有題目（舊題收起）
check("歷史預設顯示舊題（收起）", await evaluate(`
  document.querySelectorAll('.card').length === 2 &&
  [...document.querySelectorAll('.card:not(.card-latest) .card-seq')].every(b => b.getAttribute('aria-expanded') === 'false')
`));
await evaluate(`document.querySelector('.menu-btn').click()`);
await sleep(100);
check("選單有收起歷史／組員觀看連結／清除本場", await evaluate(`
  const t = [...document.querySelectorAll('.menu-item')].map(b => b.textContent);
  t.includes('收起歷史') && t.includes('組員觀看連結') && t.includes('清除本場')
`));
await evaluate(`[...document.querySelectorAll('.menu-item')].find(b => b.textContent === '收起歷史').click()`);
await sleep(100);
check("收起歷史後只剩最新一題", await evaluate(`document.querySelectorAll('.card').length === 1`));
await evaluate(`document.querySelector('.menu-btn').click()`);
await sleep(100);
await evaluate(`[...document.querySelectorAll('.menu-item')].find(b => b.textContent === '歷史').click()`);
await sleep(100);
check("再點歷史可重新展開", await evaluate(`document.querySelectorAll('.card').length === 2`));
check("點舊題可展開並看到螢光筆重點與口語稿", await evaluate(`
  (() => {
    document.querySelector('.card:not(.card-latest) .card-seq').click();
    return new Promise(r => setTimeout(r, 100)).then(() =>
      document.querySelectorAll('.card:not(.card-latest) .answer .mark').length === 2 &&
      document.querySelector('.card:not(.card-latest) .answer p')?.textContent === '這是口語稿。');
  })()
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
check("前一題移到歷史並收起", await evaluate(`
  (() => {
    const c = [...document.querySelectorAll('.card:not(.card-latest)')].find(c => c.textContent.includes('第二題'));
    return !!c && c.querySelector('.card-seq').getAttribute('aria-expanded') === 'false';
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
