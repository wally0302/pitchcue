"use client";

import { useState } from "react";
import type { RecorderApi } from "@/hooks/useRecorder";
import { fmtSeconds } from "@/lib/format";

type SetupProps = {
  rec: RecorderApi;
  slideCount: number;
  durationSeconds: number;
  onDurationChange: (seconds: number) => void;
  onWarmup: () => Promise<void>;
  onStart: () => void;
};

const WARM_LABEL = {
  idle: "暖機 AI",
  busy: "暖機中…",
  ok: "AI 已暖機",
  fail: "暖機失敗，重試",
} as const;

export function PresentationSetup({
  rec,
  slideCount,
  durationSeconds,
  onDurationChange,
  onWarmup,
  onStart,
}: SetupProps) {
  const [warm, setWarm] = useState<keyof typeof WARM_LABEL>("idle");

  const warmup = async () => {
    setWarm("busy");
    try {
      await onWarmup();
      setWarm("ok");
    } catch {
      setWarm("fail");
    }
  };

  const ready = rec.ready && warm === "ok";

  return (
    <section className="presentation-setup" aria-labelledby="presentation-setup-title">
      <p className="presentation-eyebrow">明天上台模式</p>
      <h2 id="presentation-setup-title">揪甘心｜{slideCount} 頁講稿</h2>
      <p className="presentation-setup-copy">先確認麥克風與 AI，再開始六分鐘簡報。開始後會清除上一場問答。</p>

      <div className="duration-control" aria-label="簡報總時間">
        <span className="duration-label">簡報總時間</span>
        <div className="duration-stepper">
          <button
            type="button"
            className="duration-step"
            onClick={() => onDurationChange(durationSeconds - 30)}
            disabled={durationSeconds <= 60}
            aria-label="減少三十秒"
          >
            −30 秒
          </button>
          <strong>{fmtSeconds(durationSeconds)}</strong>
          <button
            type="button"
            className="duration-step"
            onClick={() => onDurationChange(durationSeconds + 30)}
            disabled={durationSeconds >= 3600}
            aria-label="增加三十秒"
          >
            +30 秒
          </button>
        </div>
      </div>

      <div className="preflight-list">
        <div className="preflight-item">
          <span className={`preflight-state ${rec.ready ? "is-ready" : ""}`} aria-hidden />
          <div>
            <strong>麥克風</strong>
            <span>{rec.ready ? "已就緒" : rec.supported ? "尚未授權" : "此瀏覽器不支援"}</span>
          </div>
          {!rec.ready && rec.supported && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void rec.prepare()}>
              準備
            </button>
          )}
        </div>

        <div className="preflight-item">
          <span className={`preflight-state ${warm === "ok" ? "is-ready" : ""}`} aria-hidden />
          <div>
            <strong>即時回答</strong>
            <span>{warm === "ok" ? "已暖機" : warm === "busy" ? "正在連線" : "尚未暖機"}</span>
          </div>
          {warm !== "ok" && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => void warmup()}
              disabled={warm === "busy"}
            >
              {WARM_LABEL[warm]}
            </button>
          )}
        </div>
      </div>

      {rec.error && <p className="status status-error">{rec.error}</p>}

      <button type="button" className="btn btn-primary presentation-start" onClick={onStart} disabled={!ready}>
        開始簡報
      </button>
      {!ready && <p className="setup-hint">完成上面兩項準備後即可開始。</p>}
    </section>
  );
}

type RecoveryProps = {
  page: number;
  title: string;
  elapsedSeconds: number;
  durationSeconds: number;
  onContinue: () => void;
  onRestart: () => void;
};

export function PresentationRecovery({
  page,
  title,
  elapsedSeconds,
  durationSeconds,
  onContinue,
  onRestart,
}: RecoveryProps) {
  return (
    <section className="presentation-setup recovery-card" aria-labelledby="recovery-title">
      <p className="presentation-eyebrow">找到未完成的簡報</p>
      <h2 id="recovery-title">繼續 P{page}｜{title}</h2>
      <p className="presentation-setup-copy">
        已使用 {fmtSeconds(elapsedSeconds)}／{fmtSeconds(durationSeconds)}。關閉頁面期間不會計入時間。
      </p>
      <div className="recovery-actions">
        <button type="button" className="btn btn-primary" onClick={onContinue}>
          繼續簡報
        </button>
        <button type="button" className="btn btn-secondary" onClick={onRestart}>
          從 P1 重新開始
        </button>
      </div>
    </section>
  );
}
