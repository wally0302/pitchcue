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
 * 閱讀狀態的浮動操作區（右下角、拇指區）：
 * 大顆「錄下一題」一按就錄；旁邊的鍵盤鈕是麥克風壞掉時的打字備援。
 */
export function Dock({ rec, onSubmitText }: Props) {
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
    <>
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

      <div className="dock">
        {rec.error && <p className="dock-error">{rec.error}</p>}
        <div className="dock-row">
          <button
            type="button"
            className="dock-key"
            aria-label="打字輸入問題"
            onClick={() => setSheet((s) => !s)}
          >
            <KeyboardIcon />
          </button>
          <button
            type="button"
            className={`fab ${rec.recording ? "recording" : ""}`}
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
                {rec.supported && !rec.ready && <span className="fab-badge">需授權</span>}
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
