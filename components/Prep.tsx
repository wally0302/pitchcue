"use client";

import { useState } from "react";
import type { RecorderApi } from "@/hooks/useRecorder";
import { fmtSeconds } from "@/lib/format";

type Props = {
  rec: RecorderApi;
  onSubmitText: (text: string) => void;
  onWarmup: () => Promise<void>;
};

const WARM_LABEL = {
  idle: "暖機",
  busy: "暖機中…",
  ok: "已暖機",
  fail: "暖機失敗，再試一次",
} as const;

/** 準備狀態：還沒有任何題目時的畫面。上台前授權麥克風、暖機，評審開口就按錄音。 */
export function Prep({ rec, onSubmitText, onWarmup }: Props) {
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
    <div className="prep">
      <button
        type="button"
        className={`btn btn-record ${rec.recording ? "recording" : ""}`}
        disabled={!rec.supported}
        onClick={rec.toggle}
      >
        <span className="dot" aria-hidden />
        {rec.recording ? `停止錄音 ${fmtSeconds(rec.seconds)}` : "開始錄音"}
      </button>

      <div className="prep-row">
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

      <p className="empty">
        上台前先按「準備麥克風」和「暖機」。評審開口時按「開始錄音」，講完按停止，問題會轉成文字、自動生成重點與口語稿。
      </p>
    </div>
  );
}
