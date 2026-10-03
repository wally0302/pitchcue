"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Prep } from "@/components/Prep";
import { ActionBar } from "@/components/ActionBar";
import { Stage, latestOf } from "@/components/Stage";
import { TopMenu, type MenuItem } from "@/components/TopMenu";
import { PresentationRecovery, PresentationSetup } from "@/components/presentation/PresentationSetup";
import { ScriptDeck } from "@/components/presentation/ScriptDeck";
import { useRecorder } from "@/hooks/useRecorder";
import { usePresentationSession } from "@/hooks/usePresentationSession";
import { useQuestions } from "@/hooks/useQuestions";
import { useRoomSync, type SyncState } from "@/hooks/useRoomSync";
import { apiFetch } from "@/lib/client";
import type { PresentationScript } from "@/lib/presentation/types";
import presentationJson from "@/content/projects/jugansin/presentation/script.zh-Hant-TW.json";

const presentation = presentationJson as PresentationScript;

// 同步狀態只用一顆小圓點表示，文字放在 title 裡
const SYNC_DOT: Record<SyncState, { title: string; dot: "live" | "tally" | "idle" | "none" }> = {
  unknown: { title: "組員共享：待同步", dot: "none" },
  off: { title: "組員共享：未啟用", dot: "none" },
  idle: { title: "組員已同步", dot: "live" },
  syncing: { title: "同步中…", dot: "idle" },
  error: { title: "同步失敗，重試中", dot: "tally" },
  closed: { title: "組員共享：已結束（再錄下一題會自動重新開啟）", dot: "none" },
};

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

/** 此元件只在客戶端渲染（見 app/page.tsx 的 ssr:false），可以安全讀 localStorage */
export function App() {
  const q = useQuestions();
  const { addFromAudio } = q;
  const sync = useRoomSync(q.items);
  const session = usePresentationSession(presentation.defaultDurationSeconds, presentation.slides.length);

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);
  const restartCancelRef = useRef<HTMLButtonElement>(null);
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
  const endSession = async () => {
    if (!confirm("結束本場？組員的觀看頁會停止同步（紀錄會保留，之後再錄下一題會自動重新開啟）")) return;
    setShareUrl(null);
    const ok = await sync.closeRoom();
    setShareMsg(ok ? "已結束：組員觀看頁會在幾秒內停止同步。" : "結束失敗，請再試一次。");
  };
  const logout = async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {}
    // 整頁跳轉而不是 router.push：讓 proxy 重新讀 cookie，並清掉客戶端狀態
    window.location.assign(new URL("/login", window.location.origin).href);
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
  // Q&A 內有題目之後進入閱讀狀態；簡報與 Q&A 模式由 presentation session 分開管理。
  const reading = q.items.length > 0;

  // 桌機才有的快捷鍵（手機用不到，但留著不礙事）：Space 錄音、Esc 停止最新一題、Cmd/Ctrl+Enter 重新生成
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (session.screen !== "qa") return;
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
  }, [rec, q, latest, session.screen]);

  const startPresentation = () => {
    // 明天版的明確取捨：開始新簡報就直接清掉上一場 Q&A。
    q.clear();
    session.begin();
  };

  const restartPresentation = () => {
    q.clear();
    session.begin();
  };

  useEffect(() => {
    if (!restartConfirmOpen) return;

    const focusTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusCancel = window.setTimeout(() => restartCancelRef.current?.focus(), 0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setRestartConfirmOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      window.clearTimeout(focusCancel);
      document.removeEventListener("keydown", onKey);
      if (focusTarget && document.contains(focusTarget)) {
        focusTarget.focus();
      } else {
        document.querySelector<HTMLButtonElement>('.menu-btn[aria-label="更多"]')?.focus();
      }
    };
  }, [restartConfirmOpen]);

  const restartFromRecovery = () => {
    q.clear();
    session.resetToSetup();
  };

  const enterQa = (confirmEarly: boolean) => {
    if (confirmEarly && !confirm("簡報還沒到最後一頁，確定要提前進入 Q&A？")) return;
    session.enterQa();
  };

  const returnToScript = () => {
    if (rec.recording) rec.stop();
    session.returnToScript();
  };

  const qaMenu: MenuItem[] = [
    ...(session.hasPresentation ? [{ label: "返回講稿", onSelect: returnToScript }] : []),
    { label: "組員觀看連結", onSelect: () => void showShareLink() },
    // 有共享在跑（不是未啟用／未同步／已結束）才需要「結束本場」
    ...(reading && (sync.state === "idle" || sync.state === "syncing" || sync.state === "error")
      ? [{ label: "結束本場", onSelect: () => void endSession() }]
      : []),
    ...(reading
      ? [
          {
            label: "清除本場",
            danger: true,
            onSelect: () => {
              if (confirm("確定清除本場所有問答紀錄？")) q.clear();
            },
          },
        ]
      : []),
    { label: "登出", onSelect: () => void logout() },
  ];

  const scriptMenu: MenuItem[] = [
    {
      label: session.timerRunning ? "暫停計時" : "繼續計時",
      onSelect: session.timerRunning ? session.pauseTimer : session.resumeTimer,
    },
    ...(session.slideIndex < presentation.slides.length - 1
      ? [{ label: "提前進入 Q&A", onSelect: () => enterQa(true) }]
      : []),
    {
      label: "從 P1 重新開始",
      danger: true,
      onSelect: () => setRestartConfirmOpen(true),
    },
    { label: "登出", onSelect: () => void logout() },
  ];

  const menu = session.screen === "qa" ? qaMenu : session.screen === "script" ? scriptMenu : [
    { label: "登出", onSelect: () => void logout() },
  ];

  const dot = SYNC_DOT[sync.state];

  return (
    <main className="page">
      <header className="topbar">
        <h1>{session.screen === "qa" ? "PitchCue" : "揪甘心講稿"}</h1>
        {session.screen === "qa" && (
          <span className="status" title={sync.error ?? dot.title} aria-label={dot.title}>
            {dot.dot !== "none" && <span className={`dot dot-${dot.dot}`} aria-hidden />}
          </span>
        )}
        <span className="flex-1" />
        <TopMenu items={menu} />
      </header>

      {/* 錄音鈕固定在最上面：開始／停止同一顆、同一個位置，打字備援也從這排展開 */}
      {session.screen === "qa" && reading && <ActionBar rec={rec} onSubmitText={(t) => void q.addFromText(t)} />}

      {session.screen === "qa" && (shareUrl || shareMsg) && (
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

      {session.screen === "setup" && (
        <PresentationSetup
          rec={rec}
          slideCount={presentation.slides.length}
          durationSeconds={session.durationSeconds}
          onDurationChange={session.setDurationSeconds}
          onWarmup={q.warmup}
          onStart={startPresentation}
        />
      )}

      {session.screen === "recover" && (
        <PresentationRecovery
          page={presentation.slides[session.slideIndex]?.page ?? 1}
          title={presentation.slides[session.slideIndex]?.title ?? presentation.slides[0].title}
          elapsedSeconds={session.elapsedSeconds}
          durationSeconds={session.durationSeconds}
          onContinue={session.continueSession}
          onRestart={restartFromRecovery}
        />
      )}

      {session.screen === "script" && (
        <ScriptDeck
          presentation={presentation}
          slideIndex={session.slideIndex}
          elapsedSeconds={session.elapsedSeconds}
          durationSeconds={session.durationSeconds}
          timerRunning={session.timerRunning}
          fontSize={session.fontSize}
          wakeLockError={session.wakeLockError}
          onSlideChange={session.setSlideIndex}
          onToggleTimer={session.timerRunning ? session.pauseTimer : session.resumeTimer}
          onFontSizeChange={session.setFontSize}
          onEnterQa={() => enterQa(false)}
        />
      )}

      {session.screen === "qa" && (reading ? (
          <Stage
            items={q.items}
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
        ))}

      {restartConfirmOpen && (
        <div
          className="restart-dialog-backdrop"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setRestartConfirmOpen(false);
          }}
        >
          <section
            className="restart-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="restart-dialog-title"
            aria-describedby="restart-dialog-description"
          >
            <h2 id="restart-dialog-title">確定從 P1 重新開始？</h2>
            <p id="restart-dialog-description">目前的計時與所有問答都會清除，並從第一頁重新開始。</p>
            <div className="restart-dialog-actions">
              <button
                ref={restartCancelRef}
                type="button"
                className="btn btn-secondary"
                onClick={() => setRestartConfirmOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  setRestartConfirmOpen(false);
                  restartPresentation();
                }}
              >
                重新開始
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
