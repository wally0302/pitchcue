"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const CANDIDATES: Array<[mime: string, ext: string]> = [
  ["audio/webm;codecs=opus", "webm"],
  ["audio/webm", "webm"],
  ["audio/mp4;codecs=mp4a.40.2", "m4a"],
  ["audio/mp4", "m4a"],
  ["audio/ogg;codecs=opus", "ogg"],
];

function pickFormat(): { mime: string; ext: string } {
  if (typeof MediaRecorder === "undefined") return { mime: "", ext: "webm" };
  for (const [mime, ext] of CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return { mime: "", ext: "webm" };
}

function extFromMime(mime: string, fallback: string): string {
  if (!mime) return fallback;
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return fallback;
}

export type RecorderApi = {
  supported: boolean;
  ready: boolean;
  recording: boolean;
  seconds: number;
  error: string | null;
  prepare: () => Promise<boolean>;
  start: () => Promise<void>;
  stop: () => void;
  toggle: () => void;
};

/**
 * 全域唯一的錄音器。MediaStream 取得一次後整場保留；每題新建一個 MediaRecorder。
 * 錄音狀態完全獨立於任何題目的轉錄／回答進度。
 */
export function useRecorder(onStop: (blob: Blob, ext: string, durationMs: number) => void): RecorderApi {
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const onStopRef = useRef(onStop);
  useEffect(() => {
    onStopRef.current = onStop;
  }, [onStop]);

  // 此 hook 只在客戶端使用（App 以 ssr:false 載入）
  const [supported] = useState(
    () =>
      typeof navigator !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined"
  );
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const prepare = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (streamRef.current && streamRef.current.getTracks().some((t) => t.readyState === "live")) {
      setReady(true);
      return true;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      stream.getTracks().forEach((t) => {
        t.addEventListener("ended", () => {
          streamRef.current = null;
          setReady(false);
          setError("麥克風連線中斷，請重新按「準備麥克風」");
        });
      });
      setReady(true);
      return true;
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(
        name === "NotAllowedError"
          ? "麥克風權限被拒絕，請在瀏覽器網址列允許麥克風後重試"
          : `無法使用麥克風：${(e as Error)?.message ?? name}`
      );
      setReady(false);
      return false;
    }
  }, []);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const start = useCallback(async () => {
    if (recRef.current && recRef.current.state === "recording") return;
    setError(null);
    if (!streamRef.current || !streamRef.current.getTracks().some((t) => t.readyState === "live")) {
      const ok = await prepare();
      if (!ok) return;
    }
    const stream = streamRef.current!;
    const { mime, ext: preferredExt } = pickFormat();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(
        stream,
        mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined
      );
    } catch (e) {
      setError(`無法啟動錄音：${(e as Error).message}`);
      return;
    }
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onerror = () => {
      setError("錄音發生錯誤，請重試");
    };
    rec.onstop = () => {
      const actualMime = mime || rec.mimeType || "audio/webm";
      const ext = extFromMime(actualMime, preferredExt);
      const blob = new Blob(chunksRef.current, { type: actualMime });
      chunksRef.current = [];
      const duration = Date.now() - startedAtRef.current;
      onStopRef.current(blob, ext, duration);
    };
    recRef.current = rec;
    startedAtRef.current = Date.now();
    setSeconds(0);
    clearTimer();
    timerRef.current = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 250);
    rec.start(); // 不傳 timeslice，stop 時一次拿完整 Blob
    setRecording(true);
    // 手機錄音時避免螢幕自動鎖定（不支援就忽略）
    try {
      navigator.wakeLock
        ?.request("screen")
        .then((s) => {
          wakeLockRef.current = s;
        })
        .catch(() => {});
    } catch {}
  }, [prepare]);

  const stop = useCallback(() => {
    const rec = recRef.current;
    clearTimer();
    setRecording(false);
    try {
      void wakeLockRef.current?.release();
    } catch {}
    wakeLockRef.current = null;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {}
    }
    recRef.current = null;
  }, []);

  const toggle = useCallback(() => {
    if (recRef.current && recRef.current.state === "recording") stop();
    else void start();
  }, [start, stop]);

  useEffect(() => () => clearTimer(), []);

  return { supported, ready, recording, seconds, error, prepare, start, stop, toggle };
}
