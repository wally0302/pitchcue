"use client";

import { useCallback, useEffect, useState } from "react";
import { Recorder } from "@/components/Recorder";
import { QuestionCard } from "@/components/QuestionCard";
import { useRecorder } from "@/hooks/useRecorder";
import { useQuestions } from "@/hooks/useQuestions";
import { useRoomSync, type SyncState } from "@/hooks/useRoomSync";
import { apiFetch, getAppKey, setAppKey, UNAUTHORIZED_EVENT } from "@/lib/client";

const SYNC_LABEL: Record<SyncState, { text: string; dot: "live" | "tally" | "none"; error?: boolean }> = {
  unknown: { text: "待同步", dot: "none" },
  off: { text: "未共享", dot: "none" },
  idle: { text: "組員已同步", dot: "live" },
  syncing: { text: "同步中…", dot: "none" },
  error: { text: "同步失敗，重試中", dot: "tally", error: true },
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
      <header className="topbar">
        <h1>同問同答</h1>
        <span
          className={`status ${SYNC_LABEL[sync.state].error ? "status-error" : ""}`}
          title={sync.error ?? undefined}
        >
          {SYNC_LABEL[sync.state].dot !== "none" && (
            <span className={`dot dot-${SYNC_LABEL[sync.state].dot}`} aria-hidden />
          )}
          {SYNC_LABEL[sync.state].text}
        </span>
        <span className="flex-1" />
        <button type="button" className="btn-text" onClick={() => void showShareLink()}>
          組員觀看連結
        </button>
        {q.items.length > 0 && (
          <button
            type="button"
            className="btn-text"
            onClick={() => {
              if (confirm("確定清除本場所有問答紀錄？")) q.clear();
            }}
          >
            清除本場
          </button>
        )}
      </header>

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

      <Recorder
        rec={rec}
        autoAnswer={autoAnswer}
        onAutoAnswerChange={changeAuto}
        onSubmitText={(t) => void q.addFromText(t)}
        onWarmup={q.warmup}
      />

      <div className="mt-4 flex flex-col gap-3">
        {ordered.length === 0 && (
          <p className="empty">
            上台前先按「準備麥克風」和「暖機」。評審開口時按「開始錄音」，講完按停止，問題會轉成文字、再生成重點與口語稿。
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
