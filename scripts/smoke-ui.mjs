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
const goto = async (path) => {
  await send("Page.navigate", { url: BASE + path }, s);
  await sleep(2000);
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

// 主控頁：空狀態
await goto("/");
check("主控頁載入", await evaluate(`!!document.querySelector('.btn-record')`));
check("空狀態文案顯示", await evaluate(`!!document.querySelector('.empty')`));
check(
  "手機寬度沒有水平溢出",
  await evaluate(`document.documentElement.scrollWidth <= window.innerWidth`),
  await evaluate(`document.documentElement.scrollWidth + ' > ' + window.innerWidth`)
);

// 主控頁：有資料
await evaluate(`localStorage.setItem("speak:session", ${JSON.stringify(JSON.stringify(seed))})`);
await goto("/");
check("兩張卡片渲染", (await evaluate(`document.querySelectorAll('.card').length`)) === 2);
check("最新一題有紅頭線且展開", await evaluate(`
  const c = document.querySelector('.card-latest');
  c && c.querySelector('.card-seq').getAttribute('aria-expanded') === 'true' && c.textContent.includes('第二題')
`));
check("舊題預設摺疊", await evaluate(`
  [...document.querySelectorAll('.card:not(.card-latest) .card-seq')].every(b => b.getAttribute('aria-expanded') === 'false')
`));
check("點舊題可展開並看到螢光筆重點與口語稿", await evaluate(`
  const b = document.querySelector('.card:not(.card-latest) .card-seq'); b.click();
  new Promise(r => setTimeout(r, 100)).then(() =>
    document.querySelectorAll('.card:not(.card-latest) .answer .mark').length === 2 &&
    document.querySelector('.card:not(.card-latest) .answer p')?.textContent === '這是口語稿。')
`));
check("生成回答按鈕在最新一題可按", await evaluate(`
  const btn = document.querySelector('.card-latest .btn-primary'); !!btn && !btn.disabled && btn.textContent.includes('生成回答')
`));

// 打字送出新題 → 舊的最新題自動收起
await evaluate(`
  const input = document.querySelector('.controls .text-input');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, '第三題');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
`);
await sleep(300);
check("打字送出後新增第三題並成為最新", await evaluate(`
  document.querySelectorAll('.card').length === 3 && document.querySelector('.card-latest').textContent.includes('第三題')
`));
check("前一題自動摺疊", await evaluate(`
  [...document.querySelectorAll('.card')].find(c => c.textContent.includes('第二題'))
    .querySelector('.card-seq').getAttribute('aria-expanded') === 'false'
`));
check("新題的問題文字框可編輯", await evaluate(`
  const ta = document.querySelector('.card-latest textarea.question-input'); !!ta && ta.value === '第三題'
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

// 桌機寬度
await send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 800, deviceScaleFactor: 1, mobile: false }, s);
await goto("/");
check("桌機顯示鍵盤提示", await evaluate(`getComputedStyle(document.querySelector('.btn-record .kbd')).display !== 'none'`));

check("沒有 console error / 未捕捉例外", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

ws.close();
chrome.kill();
rmSync(profile, { recursive: true, force: true });
console.log(failures ? `\n${failures} 項失敗` : "\n全部通過");
process.exit(failures ? 1 : 0);
