"use client";

import { useEffect, useRef, useState } from "react";
import type { QuestionItem } from "@/lib/types";
import { QuestionCard } from "@/components/QuestionCard";

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

  const ordered = [...items].sort((a, b) => b.seq - a.seq);
  const latest = items.reduce<QuestionItem | null>((m, it) => (!m || it.seq > m.seq ? it : m), null);

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
    <main className="page">
      <header className="topbar flex-wrap">
        <h1>同問同答 · 組員觀看</h1>
        <span className={`status ${connLabel[conn].error ? "status-error" : ""}`}>
          {connLabel[conn].live && <span className="dot dot-live" aria-hidden />}
          {connLabel[conn].text}
        </span>
        {ago !== null && <span className="status">更新於 {ago} 秒前</span>}
        <span className="flex-1" />
        {conn === "unauthorized" && (
          <button type="button" className="btn-text" onClick={() => setCode("")}>
            重新輸入代碼
          </button>
        )}
      </header>

      <div className="mt-2 flex flex-col gap-3">
        {ordered.length === 0 && (
          <p className="empty">等待主控端開始錄音。評審的問題和生成的回答會即時出現在這裡。</p>
        )}
        {ordered.map((item) => (
          <QuestionCard key={item.id} item={item} latest={latest?.id === item.id} readOnly />
        ))}
      </div>
    </main>
  );
}
