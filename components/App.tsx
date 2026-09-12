"use client";

import { useCallback, useEffect, useState } from "react";
import { Prep } from "@/components/Prep";
import { ActionBar } from "@/components/ActionBar";
import { Stage, latestOf } from "@/components/Stage";
import { TopMenu, type MenuItem } from "@/components/TopMenu";
import { useRecorder } from "@/hooks/useRecorder";
import { useQuestions } from "@/hooks/useQuestions";
import { useRoomSync, type SyncState } from "@/hooks/useRoomSync";
import { apiFetch, getAppKey, setAppKey, UNAUTHORIZED_EVENT } from "@/lib/client";

// 同步狀態只用一顆小圓點表示，文字放在 title 裡
const SYNC_DOT: Record<SyncState, { title: string; dot: "live" | "tally" | "idle" | "none" }> = {
  unknown: { title: "組員共享：待同步", dot: "none" },
  off: { title: "組員共享：未啟用", dot: "none" },
  idle: { title: "組員已同步", dot: "live" },
  syncing: { title: "同步中…", dot: "idle" },
  error: { title: "同步失敗，重試中", dot: "tally" },
};

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

/** 此元件只在客戶端渲染（見 app/page.tsx 的 ssr:false），可以安全讀 localStorage */
export function App() {
  const [needKey, setNeedKey] = useState(false);
  const [keyInput, setKeyInput] = useState(getAppKey);
  const [showHistory, setShowHistory] = useState(true);

  useEffect(() => {
    const onUnauthorized = () => setNeedKey(true);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const q = useQuestions();
  const { addFromAudio } = q;
  const sync = useRoomSync(q.items);

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const showShareLink = async () => {
    setShareMsg(null);
    try {
      const res = await apiFetch("/api/room/link");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { configured: boolean; code: string | null };
      if (!data.configured || !data.code) {
        setShareMsg("尚未設定 Upstash Redis，組員共享未啟用（見 README）。");
        setShareUrl(null);
        return;
      }
      setShareUrl(`${window.location.origin}/view?code=${encodeURIComponent(data.code)}`);
    } catch (e) {
      setShareMsg(`取得連結失敗：${(e as Error).message}`);
    }
  };
  const copyShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareMsg("已複製連結");
    } catch {
      setShareMsg("無法自動複製，請手動選取連結");
    }
  };

  const onStop = useCallback(
    (blob: Blob, ext: string) => {
      void addFromAudio(blob, ext);
    },
    [addFromAudio]
  );
  const rec = useRecorder(onStop);

  const latest = latestOf(q.items);
  // 有題目之後就永遠是閱讀狀態；準備狀態只在開場前出現
  const reading = q.items.length > 0;

  // 桌機才有的快捷鍵（手機用不到，但留著不礙事）：Space 錄音、Esc 停止最新一題、Cmd/Ctrl+Enter 重新生成
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = isTypingTarget(e.target);
      if (e.code === "Space" && !typing) {
        e.preventDefault();
        rec.toggle();
        return;
      }
      if (e.key === "Escape") {
        if (latest?.status === "answering") q.abort(latest.id);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !typing) {
        if (latest && latest.status !== "transcribing" && latest.status !== "answering") {
          e.preventDefault();
          void q.answer(latest.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rec, q, latest]);

  const menu: MenuItem[] = [
    ...(reading ? [{ label: showHistory ? "收起歷史" : "歷史", onSelect: () => setShowHistory((h) => !h) }] : []),
    { label: "組員觀看連結", onSelect: () => void showShareLink() },
    ...(reading
      ? [
          {
            label: "清除本場",
            danger: true,
            onSelect: () => {
              if (confirm("確定清除本場所有問答紀錄？")) {
                q.clear();
                setShowHistory(false);
              }
            },
          },
        ]
      : []),
  ];

  const dot = SYNC_DOT[sync.state];

  return (
    <main className="page">
      <header className="topbar">
        <h1>同問同答</h1>
        <span className="status" title={sync.error ?? dot.title} aria-label={dot.title}>
          {dot.dot !== "none" && <span className={`dot dot-${dot.dot}`} aria-hidden />}
        </span>
        <span className="flex-1" />
        <TopMenu items={menu} />
      </header>

      {/* 錄音鈕固定在最上面：開始／停止同一顆、同一個位置，打字備援也從這排展開 */}
      {reading && <ActionBar rec={rec} onSubmitText={(t) => void q.addFromText(t)} />}

      {(shareUrl || shareMsg) && (
        <div className="card mb-3 text-sm">
          {shareUrl && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-ink-2">組員請開這個連結：</span>
              <code className="break-all select-all">{shareUrl}</code>
              <button type="button" className="btn-text" onClick={() => void copyShare()}>
                複製
              </button>
              <button
                type="button"
                className="btn-text"
                onClick={() => {
                  setShareUrl(null);
                  setShareMsg(null);
                }}
              >
                關閉
              </button>
            </div>
          )}
          {shareMsg && <p className="text-ink-2 mt-1">{shareMsg}</p>}
        </div>
      )}

      {needKey && (
        <div className="card mb-3">
          <p className="text-sm text-ink-2 mb-2">這個服務有設定密碼，輸入後才能送出：</p>
          <div className="flex gap-2">
            <input
              type="password"
              className="text-input flex-1"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="APP_PASSWORD"
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setAppKey(keyInput.trim());
                setNeedKey(false);
              }}
            >
              儲存
            </button>
          </div>
        </div>
      )}

      {reading ? (
        <Stage
          items={q.items}
          showHistory={showHistory}
          emptyText=""
          onAnswer={(id) => void q.answer(id)}
          onAbort={q.abort}
          onChangeQuestion={q.setQuestion}
          onRemove={(id) => {
            const it = q.items.find((x) => x.id === id);
            if (confirm(`刪除 Q${it?.seq ?? ""}？`)) q.remove(id);
          }}
        />
      ) : (
        <Prep rec={rec} onSubmitText={(t) => void q.addFromText(t)} onWarmup={q.warmup} />
      )}
    </main>
  );
}
