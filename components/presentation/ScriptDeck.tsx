"use client";

import { useEffect, useRef, useState } from "react";
import type { PresentationScript, ScriptFontSize } from "@/lib/presentation/types";
import { fmtSeconds } from "@/lib/format";

type Props = {
  presentation: PresentationScript;
  slideIndex: number;
  elapsedSeconds: number;
  durationSeconds: number;
  timerRunning: boolean;
  fontSize: ScriptFontSize;
  wakeLockError: string | null;
  onSlideChange: (index: number) => void;
  onToggleTimer: () => void;
  onFontSizeChange: (size: ScriptFontSize) => void;
  onEnterQa: () => void;
};

const FONT_LABEL: Record<ScriptFontSize, string> = {
  small: "小",
  medium: "中",
  large: "大",
};

export function ScriptDeck({
  presentation,
  slideIndex,
  elapsedSeconds,
  durationSeconds,
  timerRunning,
  fontSize,
  wakeLockError,
  onSlideChange,
  onToggleTimer,
  onFontSizeChange,
  onEnterQa,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const slide = presentation.slides[slideIndex];
  const lastIndex = presentation.slides.length - 1;
  const remaining = durationSeconds - elapsedSeconds;
  const timerState = remaining < 0 ? "overtime" : remaining <= 15 ? "critical" : remaining <= 60 ? "warning" : "normal";
  const timerText = remaining < 0 ? `+${fmtSeconds(Math.abs(remaining))}` : fmtSeconds(remaining);
  const isDenseSlide = slide.paragraphs.join("").length > 400;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [slideIndex]);

  const finishTouch = (x: number, y: number) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const dx = x - start.x;
    const dy = y - start.y;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    if (dx < 0 && slideIndex < lastIndex) onSlideChange(slideIndex + 1);
    if (dx > 0 && slideIndex > 0) onSlideChange(slideIndex - 1);
  };

  return (
    <section
      className={`script-deck script-font-${fontSize}`}
      aria-label={`${presentation.title}講稿`}
      onTouchStart={(event) => {
        const touch = event.changedTouches[0];
        touchStart.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(event) => {
        const touch = event.changedTouches[0];
        finishTouch(touch.clientX, touch.clientY);
      }}
      onTouchCancel={() => {
        touchStart.current = null;
      }}
    >
      <div className="script-toolbar">
        <button
          type="button"
          className={`script-timer timer-${timerState}`}
          onClick={onToggleTimer}
          aria-label={timerRunning ? `剩餘 ${timerText}，點擊暫停` : `計時已暫停在 ${timerText}，點擊繼續`}
        >
          <span>{timerRunning ? "剩餘" : "已暫停"}</span>
          <strong>{timerText}</strong>
        </button>

        <div className="font-switch" aria-label="講稿字級">
          {(Object.keys(FONT_LABEL) as ScriptFontSize[]).map((size) => (
            <button
              key={size}
              type="button"
              className={fontSize === size ? "is-active" : ""}
              onClick={() => onFontSizeChange(size)}
              aria-pressed={fontSize === size}
              aria-label={`${FONT_LABEL[size]}字`}
            >
              {FONT_LABEL[size]}
            </button>
          ))}
        </div>
      </div>

      {wakeLockError && <p className="wake-lock-warning">{wakeLockError}</p>}

      <article
        className={`script-page${isDenseSlide ? " script-page-dense" : ""}`}
        key={slide.id}
        aria-labelledby={`slide-${slide.id}`}
      >
        <header className="script-heading">
          <div>
            <p>P{slide.page}</p>
            <h2 id={`slide-${slide.id}`}>{slide.title}</h2>
          </div>
          <span>建議 {slide.durationSeconds} 秒</span>
        </header>

        {slide.speakerNotes?.length ? (
          <aside className="speaker-notes" aria-label="舞台提示">
            <strong>舞台提示</strong>
            {slide.speakerNotes.map((note) => <p key={note}>{note}</p>)}
          </aside>
        ) : null}

        <div className="script-copy">
          {slide.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
      </article>

      <nav className="script-nav" aria-label="講稿翻頁">
        <button
          type="button"
          className="script-nav-side"
          onClick={() => onSlideChange(slideIndex - 1)}
          disabled={slideIndex === 0}
        >
          ← 上一頁
        </button>
        <button type="button" className="script-page-picker" onClick={() => setPickerOpen(true)}>
          P{slide.page} / {presentation.slides.length}
        </button>
        {slideIndex === lastIndex ? (
          <button type="button" className="script-nav-side script-nav-finish" onClick={onEnterQa}>
            進入 Q&amp;A
          </button>
        ) : (
          <button type="button" className="script-nav-side" onClick={() => onSlideChange(slideIndex + 1)}>
            下一頁 →
          </button>
        )}
      </nav>

      {pickerOpen && (
        <div className="slide-picker-backdrop" role="presentation" onMouseDown={() => setPickerOpen(false)}>
          <section
            className="slide-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="slide-picker-title"
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onTouchEnd={(event) => event.stopPropagation()}
          >
            <div className="slide-picker-head">
              <h2 id="slide-picker-title">跳到哪一頁？</h2>
              <button type="button" className="btn-text" onClick={() => setPickerOpen(false)}>關閉</button>
            </div>
            <div className="slide-picker-list">
              {presentation.slides.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={index === slideIndex ? "is-current" : ""}
                  onClick={() => {
                    onSlideChange(index);
                    setPickerOpen(false);
                  }}
                >
                  <span>P{item.page}</span>
                  <strong>{item.title}</strong>
                  <small>{item.durationSeconds} 秒</small>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
