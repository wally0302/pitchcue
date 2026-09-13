#!/usr/bin/env python3
"""題庫實測：起臨時 dev server、跑題目、印答案、關 server。
用法：python3 battery.py [questions.json]
questions.json 格式：[{"cat":"陷阱","q":"..."}, ...]；沒給就用內建的通用題。
回答存到 $SCRATCHPAD/battery.json（沒有 SCRATCHPAD 就存 /tmp）。"""
import json, os, subprocess, sys, time, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
PORT = int(os.environ.get("BATTERY_PORT", "3123"))
OUT = os.environ.get("SCRATCHPAD", "/tmp")
DEFAULT = [
    {"cat": "數字", "q": "你們的資料有多少？怎麼處理的？"},
    {"cat": "數字", "q": "你們說能省多少時間或成本？怎麼算的？"},
    {"cat": "陷阱", "q": "你們準確率有 95% 對吧？"},
    {"cat": "陷阱", "q": "這個功能簡報有寫，程式裡也做了吧？"},
    {"cat": "技術", "q": "為什麼選這個架構，不用 XX？"},
    {"cat": "技術", "q": "安全和認證怎麼做？"},
    {"cat": "範圍外", "q": "跑一次大概花多少錢？"},
    {"cat": "範圍外", "q": "有沒有跟現成產品比過？"},
    {"cat": "挑戰", "q": "這跟直接用 ChatGPT 有什麼差別？"},
    {"cat": "即席", "q": "我現在給你一份新的輸入，現場跑給我看。"},
    {"cat": "模糊", "q": "那個分數是怎麼算的？"},
]

def ask(q, history):
    body = json.dumps({"question": q, "history": history}, ensure_ascii=False).encode()
    req = urllib.request.Request(f"http://localhost:{PORT}/api/answer", data=body,
                                 headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read().decode()

def main():
    qs = json.load(open(sys.argv[1], encoding="utf-8")) if len(sys.argv) > 1 else DEFAULT
    log = open(os.path.join(OUT, "battery-dev.log"), "w")
    srv = subprocess.Popen(["npx", "next", "dev", "-p", str(PORT)], cwd=ROOT, stdout=log, stderr=log)
    try:
        for _ in range(60):
            try:
                urllib.request.urlopen(f"http://localhost:{PORT}/", timeout=3); break
            except Exception:
                time.sleep(2)
        results = []
        for i, item in enumerate(qs, 1):
            a = ask(item["q"], [])
            results.append({"i": i, "cat": item["cat"], "q": item["q"], "a": a})
            print(f"[{i}/{len(qs)}] {item['cat']}", flush=True)
        last = results[-1]
        a = ask("剛剛講的那個，是實測還是估的？",
                [{"role": "user", "content": last["q"]}, {"role": "assistant", "content": last["a"]}])
        results.append({"i": len(qs) + 1, "cat": "追問", "q": "（接上題）剛剛講的那個，是實測還是估的？", "a": a})
        json.dump(results, open(os.path.join(OUT, "battery.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        for r in results:
            print(f"\n######## {r['i']} [{r['cat']}] {r['q']}\n{r['a'].strip()}")
    finally:
        srv.terminate()
        try:
            srv.wait(timeout=10)
        except Exception:
            srv.kill()
        subprocess.run(["pkill", "-f", f"next dev -p {PORT}"])
        print("\n(server stopped)")

if __name__ == "__main__":
    main()
