"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QuestionItem } from "@/lib/types";
import { apiFetch } from "@/lib/client";

export type SyncState = "unknown" | "off" | "idle" | "syncing" | "error" | "closed";

const THROTTLE_MS = 400;

/**
 * 主控端 → Redis 單向同步。
 * 每次 items 變動算出差異，400ms 節流合併送出；狀態變更立即送。
 * 後端回 503（未設定 Redis）就永久關閉。
 * closeRoom()：通知組員頁停止輪詢；之後 items 再變動會自動重新開啟房間。
 */
export function useRoomSync(items: QuestionItem[]) {
  const [state, setState] = useState<SyncState>("unknown");
  const [error, setError] = useState<string | null>(null);

  const lastSentRef = useRef<Map<string, string>>(new Map());
  const pendingUpsertsRef = useRef<Map<string, QuestionItem>>(new Map());
  const pendingRemovedRef = useRef<Set<string>>(new Set());
  const pendingClearRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef(false);
  const offRef = useRef(false);
  const closedRef = useRef(false);
  const hadItemsRef = useRef(false);

  const closeRoom = useCallback(async (): Promise<boolean> => {
    if (offRef.current) return false;
    // 丟掉還沒送出的變動：結束就是結束，不要在 close 之後又補送一包把房間重新打開
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingUpsertsRef.current.clear();
    pendingRemovedRef.current.clear();
    pendingClearRef.current = false;
    try {
      const res = await apiFetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ close: true }),
      });
      if (res.status === 503) {
        offRef.current = true;
        setState("off");
        return false;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      closedRef.current = true;
      setError(null);
      setState("closed");
      return true;
    } catch (e) {
      setError((e as Error).message);
      setState("error");
      return false;
    }
  }, []);

  useEffect(() => {
    if (offRef.current) return;

    const flush = async () => {
      timerRef.current = null;
      if (offRef.current || inflightRef.current) return;
      const upserts = [...pendingUpsertsRef.current.values()];
      const removed = [...pendingRemovedRef.current];
      const clear = pendingClearRef.current;
      if (!upserts.length && !removed.length && !clear) return;

      inflightRef.current = true;
      closedRef.current = false; // 任何寫入都會讓後端重新開啟房間
      setState("syncing");
      try {
        const res = await apiFetch("/api/room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ upserts, removed, clear }),
        });
        if (res.status === 503) {
          offRef.current = true;
          setState("off");
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // 成功：記錄已送出的版本、清掉 pending 中「沒有再變動」的部分
        for (const it of upserts) {
          const json = JSON.stringify(it);
          lastSentRef.current.set(it.id, json);
          const cur = pendingUpsertsRef.current.get(it.id);
          if (cur && JSON.stringify(cur) === json) pendingUpsertsRef.current.delete(it.id);
        }
        for (const id of removed) {
          lastSentRef.current.delete(id);
          pendingRemovedRef.current.delete(id);
        }
        if (clear) pendingClearRef.current = false;
        setError(null);
        // 若這包送出後使用者已按了結束（closeRoom 先回來），維持「已結束」
        setState(closedRef.current ? "closed" : "idle");
      } catch (e) {
        setError((e as Error).message);
        setState("error");
      } finally {
        inflightRef.current = false;
        // 期間又有變動 → 再排一次
        if (
          !offRef.current &&
          (pendingUpsertsRef.current.size || pendingRemovedRef.current.size || pendingClearRef.current)
        ) {
          schedule(THROTTLE_MS);
        }
      }
    };

    const schedule = (ms: number) => {
      if (timerRef.current) {
        if (ms > 0) return; // 已排程且不是立即 → 等原本的
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => void flush(), ms);
    };

    // 計算差異
    const currentIds = new Set(items.map((it) => it.id));
    let urgent = false;

    if (items.length === 0 && hadItemsRef.current) {
      // 清除本場
      pendingClearRef.current = true;
      pendingUpsertsRef.current.clear();
      pendingRemovedRef.current.clear();
      lastSentRef.current.clear();
      urgent = true;
    } else {
      for (const it of items) {
        const json = JSON.stringify(it);
        const prev = lastSentRef.current.get(it.id);
        if (prev !== json) {
          pendingUpsertsRef.current.set(it.id, it);
          if (!prev) urgent = true;
          else {
            try {
              const p = JSON.parse(prev) as QuestionItem;
              if (p.status !== it.status || p.question !== it.question) urgent = true;
            } catch {
              urgent = true;
            }
          }
        }
      }
      for (const id of lastSentRef.current.keys()) {
        if (!currentIds.has(id)) {
          pendingRemovedRef.current.add(id);
          pendingUpsertsRef.current.delete(id);
          urgent = true;
        }
      }
    }
    hadItemsRef.current = items.length > 0;

    if (pendingUpsertsRef.current.size || pendingRemovedRef.current.size || pendingClearRef.current) {
      schedule(urgent ? 0 : THROTTLE_MS);
    }
  }, [items]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return { state, error, closeRoom };
}
