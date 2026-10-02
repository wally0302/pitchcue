"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ScriptFontSize } from "@/lib/presentation/types";

const SESSION_KEY = "pitchcue:presentation:session:v1";
const PREFS_KEY = "pitchcue:presentation:prefs:v1";

export type PresentationScreen = "setup" | "recover" | "script" | "qa";

type StoredSession = {
  version: 1;
  screen: "script" | "qa";
  slideIndex: number;
  durationSeconds: number;
  elapsedSeconds: number;
  timerRunning: boolean;
  fontSize: ScriptFontSize;
};

type StoredPreferences = {
  durationSeconds?: number;
  fontSize?: ScriptFontSize;
};

function isFontSize(value: unknown): value is ScriptFontSize {
  return value === "small" || value === "medium" || value === "large";
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function clampDuration(seconds: number) {
  return Math.min(60 * 60, Math.max(60, Math.round(seconds)));
}

function loadInitial(defaultDurationSeconds: number) {
  const prefs = readJson<StoredPreferences>(PREFS_KEY);
  const saved = readJson<StoredSession>(SESSION_KEY);
  const durationSeconds = clampDuration(prefs?.durationSeconds ?? saved?.durationSeconds ?? defaultDurationSeconds);
  const fontSize = isFontSize(prefs?.fontSize)
    ? prefs.fontSize
    : isFontSize(saved?.fontSize)
      ? saved.fontSize
      : "medium";

  if (!saved || saved.version !== 1) {
    return { saved: null, durationSeconds, fontSize };
  }

  return {
    saved: {
      ...saved,
      durationSeconds: clampDuration(saved.durationSeconds),
      elapsedSeconds: Math.max(0, Math.floor(saved.elapsedSeconds)),
      slideIndex: Math.max(0, Math.floor(saved.slideIndex)),
      fontSize,
    },
    durationSeconds,
    fontSize,
  };
}

export function usePresentationSession(defaultDurationSeconds: number, slideCount: number) {
  const [initial] = useState(() => loadInitial(defaultDurationSeconds));
  const [screen, setScreen] = useState<PresentationScreen>(() => {
    if (!initial.saved) return "setup";
    return initial.saved.screen === "qa" ? "qa" : "recover";
  });
  const [hasPresentation, setHasPresentation] = useState(Boolean(initial.saved));
  const [slideIndex, setSlideIndexState] = useState(() =>
    Math.min(Math.max(0, initial.saved?.slideIndex ?? 0), Math.max(0, slideCount - 1))
  );
  const [durationSeconds, setDurationState] = useState(initial.saved?.durationSeconds ?? initial.durationSeconds);
  const [elapsedSeconds, setElapsedSeconds] = useState(initial.saved?.elapsedSeconds ?? 0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [fontSize, setFontSizeState] = useState<ScriptFontSize>(initial.fontSize);
  const [wakeLockError, setWakeLockError] = useState<string | null>(null);

  const runningRef = useRef(false);
  const baseElapsedRef = useRef(initial.saved?.elapsedSeconds ?? 0);
  const runStartedAtRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const currentElapsed = useCallback(() => {
    if (!runningRef.current) return baseElapsedRef.current;
    return baseElapsedRef.current + Math.floor((Date.now() - runStartedAtRef.current) / 1000);
  }, []);

  const pauseTimer = useCallback(() => {
    const next = currentElapsed();
    baseElapsedRef.current = next;
    runningRef.current = false;
    setElapsedSeconds(next);
    setTimerRunning(false);
  }, [currentElapsed]);

  const resumeTimer = useCallback(() => {
    if (runningRef.current) return;
    runStartedAtRef.current = Date.now();
    runningRef.current = true;
    setTimerRunning(true);
  }, []);

  const begin = useCallback(() => {
    baseElapsedRef.current = 0;
    runStartedAtRef.current = Date.now();
    runningRef.current = true;
    setElapsedSeconds(0);
    setSlideIndexState(0);
    setHasPresentation(true);
    setScreen("script");
    setTimerRunning(true);
  }, []);

  const continueSession = useCallback(() => {
    setScreen("script");
    resumeTimer();
  }, [resumeTimer]);

  const resetToSetup = useCallback(() => {
    runningRef.current = false;
    baseElapsedRef.current = 0;
    setTimerRunning(false);
    setElapsedSeconds(0);
    setSlideIndexState(0);
    setHasPresentation(false);
    setScreen("setup");
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {}
  }, []);

  const enterQa = useCallback(() => {
    pauseTimer();
    setScreen("qa");
  }, [pauseTimer]);

  const returnToScript = useCallback(() => {
    pauseTimer();
    setScreen("script");
  }, [pauseTimer]);

  const setSlideIndex = useCallback(
    (next: number) => setSlideIndexState(Math.min(Math.max(0, next), Math.max(0, slideCount - 1))),
    [slideCount]
  );

  const setDurationSeconds = useCallback((seconds: number) => {
    setDurationState(clampDuration(seconds));
  }, []);

  const setFontSize = useCallback((size: ScriptFontSize) => {
    setFontSizeState(size);
  }, []);

  useEffect(() => {
    if (!timerRunning) return;
    const timer = window.setInterval(() => setElapsedSeconds(currentElapsed()), 250);
    return () => window.clearInterval(timer);
  }, [currentElapsed, timerRunning]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ durationSeconds, fontSize } satisfies StoredPreferences));
    } catch {}
  }, [durationSeconds, fontSize]);

  useEffect(() => {
    if (!hasPresentation) return;
    const stored: StoredSession = {
      version: 1,
      screen: screen === "qa" ? "qa" : "script",
      slideIndex,
      durationSeconds,
      elapsedSeconds,
      timerRunning,
      fontSize,
    };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    } catch {}
  }, [durationSeconds, elapsedSeconds, fontSize, hasPresentation, screen, slideIndex, timerRunning]);

  useEffect(() => {
    const shouldLock = screen === "script" && timerRunning;
    if (!shouldLock) return;

    let cancelled = false;
    const request = async () => {
      if (!("wakeLock" in navigator) || !navigator.wakeLock) {
        setWakeLockError("此瀏覽器無法保持螢幕常亮，請暫時關閉自動鎖定。");
        return;
      }
      if (document.visibilityState !== "visible" || wakeLockRef.current) return;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
        setWakeLockError(null);
        sentinel.addEventListener("release", () => {
          if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
        });
      } catch {
        setWakeLockError("無法保持螢幕常亮，請暫時關閉自動鎖定。");
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      const lock = wakeLockRef.current;
      wakeLockRef.current = null;
      if (lock) void lock.release().catch(() => {});
    };
  }, [screen, timerRunning]);

  return {
    screen,
    hasPresentation,
    slideIndex,
    durationSeconds,
    elapsedSeconds,
    timerRunning,
    fontSize,
    wakeLockError,
    begin,
    continueSession,
    resetToSetup,
    enterQa,
    returnToScript,
    pauseTimer,
    resumeTimer,
    setSlideIndex,
    setDurationSeconds,
    setFontSize,
  };
}
