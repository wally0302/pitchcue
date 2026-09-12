"use client";

import { useEffect, useRef, useState } from "react";
import type { QuestionItem } from "@/lib/types";
import { Stage } from "@/components/Stage";
import { TopMenu } from "@/components/TopMenu";

// 輪詢節奏：有內容在變就每秒；一陣子沒新內容就放慢；太久沒動靜就完全停止，避免分頁忘了關一直打 API
const POLL_MS = 1000;
const SLOW_AFTER_MS = 10 * 60_000; // 10 分鐘沒新內容、沒操作 → 改每 3 秒
const SLOW_POLL_MS = 3000;
const STOP_AFTER_MS = 30 * 60_000; // 30 分鐘沒新內容、沒操作 → 停止輪詢，點畫面才恢復
const MAX_BACKOFF_MS = 30_000; // 連線失敗：1s → 2s → 4s … 最多 30s

type Conn = "connecting" | "live" | "retrying" | "unauthorized" | "off" | "paused" | "closed";

function readCodeFromUrl(): string {
  try {
    return new URLSearchParams(window.location.search).get("code") ?? "";
  } catch {
    return "";
  }
}

export function Viewer() {
  const [code, setCode] = useState(readCodeFromUrl);
  const [codeInput, setCodeInput] = useState("");
  const [items, setItems] = useState<QuestionItem[]>([]);
  const [conn, setConn] = useState<Conn>("connecting");
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [showHistory, setShowHistory] = useState(true);
  const vRef = useRef(-1);

  // 輪詢（setTimeout 鏈，不用 setInterval：每次跑完才決定下一次多久之後、要不要繼續）
  useEffect(() => {
    if (!code) return;
    let stopped = false; // effect 已卸載
    let halted = false; // 401 / 503：再打也沒用，永久停止（換代碼或重新整理才會重來）
    let inflight = false;
    let mode: "fast" | "slow" | "paused" = "fast";
    let failures = 0;
    let lastActive = Date.now(); // 最近一次「有新內容」或「使用者有操作」
    let timer: ReturnType<typeof setTimeout> | null = null;
    vRef.current = -1;

    const schedule = (ms: number) => {
      if (stopped || halted) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void tick(), ms);
    };

    const tick = async () => {
      if (stopped || halted || inflight) return;
      if (document.hidden) return; // 背景分頁不打；回前景時 onVis 會再喚醒
      const idle = Date.now() - lastActive;
      if (idle >= STOP_AFTER_MS) {
        mode = "paused";
        setConn("paused");
        return; // 不再排程，等使用者點畫面
      }
      inflight = true;
      try {
        const res = await fetch(`/api/room?code=${encodeURIComponent(code)}&v=${vRef.current}`, {
          cache: "no-store",
        });
        if (res.status === 401) {
          halted = true;
          setConn("unauthorized");
          return;
        }
        if (res.status === 503) {
          halted = true;
          setConn("off");
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { v: number; closed?: boolean; items?: QuestionItem[] };
        if (typeof data.v === "number" && data.v !== vRef.current) {
          vRef.current = data.v;
          lastActive = Date.now();
          if (data.items) {
            setItems(data.items);
            setLastUpdate(Date.now());
          }
        }
        failures = 0;
        if (data.closed) {
          // 主控端按了「結束本場」：內容留在畫面上，停止輪詢；點畫面可重新連線（主控端再錄會自動重開）
          mode = "paused";
          setConn("closed");
          return;
        }
        setConn("live");
        mode = Date.now() - lastActive >= SLOW_AFTER_MS ? "slow" : "fast";
        schedule(mode === "slow" ? SLOW_POLL_MS : POLL_MS);
      } catch {
        if (stopped) return;
        failures += 1;
        setConn("retrying");
        schedule(Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS));
      } finally {
        inflight = false;
      }
    };

    // 使用者有動作（點畫面、切回前景）→ 視為在使用：重置閒置計時，慢速或暫停中就立刻抓一次
    const wake = () => {
      if (stopped || halted) return;
      lastActive = Date.now();
      if (mode !== "fast") {
        mode = "fast";
        schedule(0);
      }
    };
    const onVis = () => {
      if (!document.hidden) wake();
    };

    void tick();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [code]);

  // 「更新於 n 秒前」用
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!code) {
    return (
      <main className="page">
        <header className="topbar">
          <h1>PitchCue · 組員觀看</h1>
        </header>
        <div className="card">
          <p className="mb-2 text-sm text-ink-2">輸入房間代碼（主控端按「組員觀看連結」可以看到）：</p>
          <div className="flex gap-2">
            <input
              className="text-input flex-1"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="ROOM_CODE"
              onKeyDown={(e) => {
                if (e.key === "Enter" && codeInput.trim()) applyCode(codeInput.trim());
              }}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={!codeInput.trim()}
              onClick={() => applyCode(codeInput.trim())}
            >
              進入
            </button>
          </div>
        </div>
      </main>
    );
  }

  function applyCode(c: string) {
    const u = new URL(window.location.href);
    u.searchParams.set("code", c);
    window.history.replaceState(null, "", u.toString());
    setConn("connecting");
    setCode(c);
  }

  const connLabel: Record<Conn, { text: string; live?: boolean; error?: boolean }> = {
    connecting: { text: "連線中…" },
    live: { text: "即時同步中", live: true },
    retrying: { text: "連線中斷，重試中…", error: true },
    unauthorized: { text: "房間代碼錯誤", error: true },
    off: { text: "主控端尚未啟用共享", error: true },
    paused: { text: "閒置太久已暫停，點一下畫面繼續", error: true },
    closed: { text: "主控端已結束本場（點一下畫面可重新連線）" },
  };
  const ago = lastUpdate && now ? Math.max(0, Math.round((now - lastUpdate) / 1000)) : null;

  return (
    <main className="page page-reading">
      <header className="topbar">
        <h1>PitchCue · 組員觀看</h1>
        <span
          className={`status ${connLabel[conn].error ? "status-error" : ""}`}
          title={ago !== null ? `更新於 ${ago} 秒前` : undefined}
        >
          {connLabel[conn].live && <span className="dot dot-live" aria-hidden />}
          {connLabel[conn].text}
        </span>
        <span className="flex-1" />
        <TopMenu
          items={[
            { label: showHistory ? "收起歷史" : "歷史", onSelect: () => setShowHistory((h) => !h) },
            ...(conn === "unauthorized" ? [{ label: "重新輸入代碼", onSelect: () => setCode("") }] : []),
          ]}
        />
      </header>

      <div className="mt-2">
        <Stage
          items={items}
          showHistory={showHistory}
          readOnly
          emptyText="等待主控端開始錄音。評審的問題和生成的回答會即時出現在這裡。"
        />
      </div>
    </main>
  );
}
