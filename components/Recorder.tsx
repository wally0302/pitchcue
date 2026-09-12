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

export function Recorder({ rec, autoAnswer, onAutoAnswerChange, onSubmitText, onWarmup }: Props) {
  const [text, setText] = useState("");
  const [warm, setWarm] = useState<"idle" | "busy" | "ok" | "fail">("idle");

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
    <div className="toolbar">
      <div className="flex flex-wrap items-center gap-3">
        {!rec.supported ? (
          <span className="text-red-300">此瀏覽器不支援錄音，請改用文字輸入</span>
        ) : rec.ready ? (
          <span className="chip chip-ok">● 麥克風已就緒</span>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => void rec.prepare()}>
            🎤 準備麥克風
          </button>
        )}

        <button
          type="button"
          className={`btn btn-record ${rec.recording ? "recording" : ""}`}
          disabled={!rec.supported}
          onClick={rec.toggle}
        >
          {rec.recording ? `■ 結束錄音 ${fmt(rec.seconds)}` : "● 開始錄音"}
          <span className="kbd">Space</span>
        </button>

        <span className="flex-1" />

        <label className="flex items-center gap-2 cursor-pointer select-none text-zinc-200">
          <input
            type="checkbox"
            className="w-5 h-5 accent-amber-400"
            checked={autoAnswer}
            onChange={(e) => onAutoAnswerChange(e.target.checked)}
          />
          轉錄後自動回答
        </label>

        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void doWarmup()}
          disabled={warm === "busy"}
          title="上台前按一次，把專案文件送進快取，第一題回得比較快"
        >
          {warm === "busy" ? "暖機中…" : warm === "ok" ? "✓ 已暖機" : warm === "fail" ? "暖機失敗，重試" : "🔥 暖機"}
        </button>
      </div>

      {rec.error && <p className="text-red-300 mt-2">{rec.error}</p>}

      <div className="flex gap-2 mt-3">
        <input
          type="text"
          className="text-input flex-1"
          placeholder="或直接打字輸入評審的問題（麥克風失敗時的備援），Enter 送出"
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
