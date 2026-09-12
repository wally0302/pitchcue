"use client";

import { useState } from "react";
import type { RecorderApi } from "@/hooks/useRecorder";

type Props = {
  rec: RecorderApi;
  autoAnswer: boolean;
  onAutoAnswerChange: (v: boolean) => void;
  onSubmitText: (text: string) => void;
  onWarmup: () => Promise<void>;
};

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

const WARM_LABEL = {
  idle: "暖機",
  busy: "暖機中…",
  ok: "已暖機",
  fail: "暖機失敗，再試一次",
} as const;

export function Recorder({ rec, autoAnswer, onAutoAnswerChange, onSubmitText, onWarmup }: Props) {
  const [text, setText] = useState("");
  const [warm, setWarm] = useState<keyof typeof WARM_LABEL>("idle");

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onSubmitText(t);
    setText("");
  };

  const doWarmup = async () => {
    setWarm("busy");
    try {
      await onWarmup();
      setWarm("ok");
    } catch {
      setWarm("fail");
    }
  };

  return (
    <div className="controls">
      <button
        type="button"
        className={`btn btn-record ${rec.recording ? "recording" : ""}`}
        disabled={!rec.supported}
        onClick={rec.toggle}
      >
        <span className="dot" aria-hidden />
        {rec.recording ? `停止錄音 ${fmt(rec.seconds)}` : "開始錄音"}
        <span className="kbd">Space</span>
      </button>

      <div className="controls-row">
        {!rec.supported ? (
          <span className="status status-error">此瀏覽器不支援錄音，請改用下方打字輸入</span>
        ) : rec.ready ? (
          <span className="status">
            <span className="dot dot-live" aria-hidden />
            麥克風已就緒
          </span>
        ) : (
          <button type="button" className="btn-text" onClick={() => void rec.prepare()}>
            準備麥克風
          </button>
        )}

        <button
          type="button"
          className="btn-text"
          onClick={() => void doWarmup()}
          disabled={warm === "busy" || warm === "ok"}
          title="上台前按一次，把專案文件送進快取，第一題回得比較快"
        >
          {WARM_LABEL[warm]}
        </button>

        <label className="flex items-center gap-2 cursor-pointer select-none ml-auto">
          <input
            type="checkbox"
            className="w-4 h-4 accent-ink"
            checked={autoAnswer}
            onChange={(e) => onAutoAnswerChange(e.target.checked)}
          />
          轉錄後自動回答
        </label>
      </div>

      {rec.error && <p className="status status-error mt-2">{rec.error}</p>}

      <div className="flex gap-2 mt-3">
        <input
          type="text"
          className="text-input flex-1"
          placeholder="或直接打字輸入評審的問題"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" className="btn btn-secondary" onClick={submit} disabled={!text.trim()}>
          送出
        </button>
      </div>
    </div>
  );
}
