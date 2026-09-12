"use client";

import { useCallback, useEffect, useState } from "react";
import { Recorder } from "@/components/Recorder";
import { QuestionCard } from "@/components/QuestionCard";
import { useRecorder } from "@/hooks/useRecorder";
import { useQuestions } from "@/hooks/useQuestions";
import { useRoomSync, type SyncState } from "@/hooks/useRoomSync";
import { apiFetch, getAppKey, setAppKey, UNAUTHORIZED_EVENT } from "@/lib/client";

const SYNC_LABEL: Record<SyncState, { text: string; cls: string }> = {
  unknown: { text: "組員共享：待同步", cls: "badge-ready" },
  off: { text: "組員共享：未啟用", cls: "" },
  idle: { text: "● 組員已同步", cls: "badge-done" },
  syncing: { text: "同步中…", cls: "badge-answering" },
  error: { text: "同步失敗，重試中", cls: "badge-error" },
};

const AUTO_KEY = "speak:autoAnswer";

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

function readAutoAnswer(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}

/** 此元件只在客戶端渲染（見 app/page.tsx 的 ssr:false），可以安全讀 localStorage */
export function App() {
  const [autoAnswer, setAutoAnswer] = useState(readAutoAnswer);
  const [needKey, setNeedKey] = useState(false);
  const [keyInput, setKeyInput] = useState(getAppKey);

  useEffect(() => {
    const onUnauthorized = () => setNeedKey(true);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const changeAuto = (v: boolean) => {
    setAutoAnswer(v);
    try {
      localStorage.setItem(AUTO_KEY, v ? "1" : "0");
    } catch {}
  };

  const q = useQuestions({ autoAnswer });
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

  const latest = q.items.length ? q.items[q.items.length - 1] : null;

  // 全域快捷鍵：Space 錄音、Esc 停止最新一題、Cmd/Ctrl+Enter 回答最新一題
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

  const ordered = [...q.items].sort((a, b) => b.seq - a.seq);

  return (
    <main className="page">
      <header className="flex items-baseline gap-4 mb-4">
        <h1 className="text-2xl font-bold text-amber-300">同問同答 · 評審 Q&amp;A 助手</h1>
        <span className="text-zinc-500 text-sm">錄音 → 看懂問題 → 按回答 → 照著講</span>
        <span className="flex-1" />
        <span className={`badge ${SYNC_LABEL[sync.state].cls}`} title={sync.error ?? undefined}>
          {SYNC_LABEL[sync.state].text}
        </span>
        <button type="button" className="btn-ghost text-sm" onClick={() => void showShareLink()}>
          組員觀看連結
        </button>
        {q.items.length > 0 && (
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={() => {
              if (confirm("確定清除本場所有問答紀錄？")) q.clear();
            }}
          >
            清除本場
          </button>
        )}
      </header>

      {(shareUrl || shareMsg) && (
        <div className="toolbar mb-3">
          {shareUrl && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-zinc-300">組員請開：</span>
              <code className="text-amber-200 break-all select-all">{shareUrl}</code>
              <button type="button" className="btn-ghost text-sm" onClick={() => void copyShare()}>
                複製
              </button>
              <button
                type="button"
                className="btn-ghost text-sm"
                onClick={() => {
                  setShareUrl(null);
                  setShareMsg(null);
                }}
              >
                關閉
              </button>
            </div>
          )}
          {shareMsg && <p className="text-zinc-300 mt-1">{shareMsg}</p>}
        </div>
      )}

      {needKey && (
        <div className="toolbar mb-3 border-amber-500/60">
          <p className="text-amber-200 mb-2">這個服務有設定密碼，請輸入後再重試：</p>
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

      <Recorder
        rec={rec}
        autoAnswer={autoAnswer}
        onAutoAnswerChange={changeAuto}
        onSubmitText={(t) => void q.addFromText(t)}
        onWarmup={q.warmup}
      />

      <div className="mt-6 flex flex-col gap-5">
        {ordered.length === 0 && (
          <p className="text-zinc-500 text-lg text-center py-10">
            上台前先按「準備麥克風」與「暖機」。評審開始講話時按 Space 或「開始錄音」。
          </p>
        )}
        {ordered.map((item) => (
          <QuestionCard
            key={item.id}
            item={item}
            latest={latest?.id === item.id}
            onAnswer={(id) => void q.answer(id)}
            onAbort={q.abort}
            onChangeQuestion={q.setQuestion}
            onRemove={(id) => {
              if (confirm(`刪除 Q${item.seq}？`)) q.remove(id);
            }}
          />
        ))}
      </div>
    </main>
  );
}
