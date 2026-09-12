"use client";

import { useEffect, useRef, useState } from "react";
import type { QuestionItem } from "@/lib/types";
import { Stage } from "@/components/Stage";
import { TopMenu } from "@/components/TopMenu";

const POLL_MS = 1000;

type Conn = "connecting" | "live" | "retrying" | "unauthorized" | "off";

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
  const [showHistory, setShowHistory] = useState(false);
  const vRef = useRef(-1);

  // 輪詢
  useEffect(() => {
    if (!code) return;
    let stopped = false;
    let inflight = false;
    vRef.current = -1;

    const tick = async () => {
      if (stopped || inflight || document.hidden) return;
      inflight = true;
      try {
        const res = await fetch(`/api/room?code=${encodeURIComponent(code)}&v=${vRef.current}`, {
          cache: "no-store",
        });
        if (res.status === 401) {
          setConn("unauthorized");
          return;
        }
        if (res.status === 503) {
          setConn("off");
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { v: number; items?: QuestionItem[] };
        if (typeof data.v === "number" && data.v !== vRef.current) {
          vRef.current = data.v;
          if (data.items) {
            setItems(data.items);
            setLastUpdate(Date.now());
          }
        }
        setConn("live");
      } catch {
        if (!stopped) setConn("retrying");
      } finally {
        inflight = false;
      }
    };

    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    const onVis = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
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
          <h1>同問同答 · 組員觀看</h1>
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
  };
  const ago = lastUpdate && now ? Math.max(0, Math.round((now - lastUpdate) / 1000)) : null;

  return (
    <main className="page page-reading">
      <header className="topbar">
        <h1>同問同答 · 組員觀看</h1>
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
