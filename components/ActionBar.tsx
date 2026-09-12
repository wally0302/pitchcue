"use client";

import { useState } from "react";
import type { RecorderApi } from "@/hooks/useRecorder";
import { fmtSeconds } from "@/lib/format";

type Props = {
  rec: RecorderApi;
  onSubmitText: (text: string) => void;
};

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M7 10h1M11 10h1M15 10h1M7 14h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 閱讀狀態的操作列：貼在畫面最上方，往下捲也跟著。
 * 一顆錄音鈕負責開始與停止（位置不動，手指不用找），旁邊的鍵盤鈕是麥克風壞掉時的打字備援，
 * 輸入框從這排底下展開，所有操作都集中在同一個地方。
 */
export function ActionBar({ rec, onSubmitText }: Props) {
  const [sheet, setSheet] = useState(false);
  const [text, setText] = useState("");

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onSubmitText(t);
    setText("");
    setSheet(false);
  };

  return (
    <div className="actionbar">
      <div className="actionbar-row">
        <button
          type="button"
          className={`btn btn-record ${rec.recording ? "recording" : ""}`}
          disabled={!rec.supported}
          onClick={rec.toggle}
        >
          {rec.recording ? (
            <>
              <span className="dot" aria-hidden />
              停止 {fmtSeconds(rec.seconds)}
            </>
          ) : (
            <>
              <MicIcon />
              錄下一題
              {rec.supported && !rec.ready && <span className="rec-badge">需授權</span>}
            </>
          )}
        </button>
        <button
          type="button"
          className="key-btn"
          aria-label="打字輸入問題"
          aria-expanded={sheet}
          onClick={() => setSheet((s) => !s)}
        >
          <KeyboardIcon />
        </button>
      </div>

      {rec.error && <p className="status status-error mt-2">{rec.error}</p>}

      {sheet && (
        <div className="sheet" role="dialog" aria-label="打字輸入問題">
          <textarea
            className="text-input"
            rows={3}
            autoFocus
            placeholder="打字輸入評審的問題，Enter 送出"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
              if (e.key === "Escape") setSheet(false);
            }}
          />
          <div className="flex gap-2 mt-2">
            <button type="button" className="btn btn-secondary flex-1" onClick={() => setSheet(false)}>
              取消
            </button>
            <button type="button" className="btn btn-primary flex-1" onClick={submit} disabled={!text.trim()}>
              送出
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
