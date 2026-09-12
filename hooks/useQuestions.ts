"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { HistoryPair, QuestionItem } from "@/lib/types";
import { apiFetch, readErrorMessage } from "@/lib/client";

const STORAGE_KEY = "speak:session";

type Action =
  | { type: "hydrate"; items: QuestionItem[] }
  | { type: "add"; item: QuestionItem }
  | { type: "patch"; id: string; patch: Partial<QuestionItem> }
  | { type: "appendAnswer"; id: string; delta: string }
  | { type: "remove"; id: string }
  | { type: "clear" };

function reducer(items: QuestionItem[], a: Action): QuestionItem[] {
  switch (a.type) {
    case "hydrate":
      return a.items;
    case "add":
      return [...items, a.item];
    case "patch":
      return items.map((it) => (it.id === a.id ? { ...it, ...a.patch } : it));
    case "appendAnswer":
      return items.map((it) => (it.id === a.id ? { ...it, answer: it.answer + a.delta } : it));
    case "remove":
      return items.filter((it) => it.id !== a.id);
    case "clear":
      return [];
  }
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 載入上次紀錄；進行中的題目標記為中斷（只在客戶端執行） */
function loadSaved(): QuestionItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const saved = JSON.parse(raw) as QuestionItem[];
    if (!Array.isArray(saved)) return [];
    return saved.map((it) =>
      it.status === "transcribing" || it.status === "answering"
        ? {
            ...it,
            status: it.question ? ("ready" as const) : ("error" as const),
            error: it.question ? undefined : "頁面重新整理，流程中斷",
            phase: undefined,
          }
        : it
    );
  } catch {
    return [];
  }
}

export function useQuestions() {
  const [items, dispatch] = useReducer(reducer, undefined, loadSaved);
  const itemsRef = useRef<QuestionItem[]>(items);
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const seqRef = useRef(items.reduce((m, it) => Math.max(m, it.seq), 0));

  useEffect(() => {
    itemsRef.current = items;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items]);

  const nextSeq = () => {
    seqRef.current += 1;
    return seqRef.current;
  };

  /** 回答某一題：獨立的串流，只帶「已完成且在它之前」的題目當上下文 */
  const answer = useCallback(async (id: string, questionOverride?: string, seqOverride?: number) => {
    const item = itemsRef.current.find((it) => it.id === id);
    const seq = item?.seq ?? seqOverride ?? Number.MAX_SAFE_INTEGER;
    const question = (questionOverride ?? item?.question ?? "").trim();
    if (!question) {
      dispatch({ type: "patch", id, patch: { status: "error", error: "問題是空的" } });
      return;
    }
    controllersRef.current.get(id)?.abort();
    const ac = new AbortController();
    controllersRef.current.set(id, ac);

    const history: HistoryPair[] = itemsRef.current
      .filter((it) => it.id !== id && it.status === "done" && it.seq < seq && it.answer)
      .sort((a, b) => a.seq - b.seq)
      .map((it) => ({ q: it.question, a: it.answer }));

    dispatch({ type: "patch", id, patch: { status: "answering", answer: "", error: undefined, phase: "生成回答中" } });

    try {
      const res = await apiFetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(await readErrorMessage(res));
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const delta = dec.decode(value, { stream: true });
        if (delta) dispatch({ type: "appendAnswer", id, delta });
      }
      const tail = dec.decode();
      if (tail) dispatch({ type: "appendAnswer", id, delta: tail });
      dispatch({ type: "patch", id, patch: { status: "done", phase: undefined } });
    } catch (e) {
      if (ac.signal.aborted) {
        dispatch({ type: "patch", id, patch: { status: "ready", phase: undefined } });
      } else {
        dispatch({
          type: "patch",
          id,
          patch: { status: "error", error: (e as Error).message, phase: undefined },
        });
      }
    } finally {
      if (controllersRef.current.get(id) === ac) controllersRef.current.delete(id);
    }
  }, []);

  /** 錄音結束 → 新卡片 → 獨立 pipeline（轉錄 → 整理 → 自動回答） */
  const addFromAudio = useCallback(
    async (blob: Blob, ext: string) => {
      const id = newId();
      const item: QuestionItem = {
        id,
        seq: nextSeq(),
        createdAt: Date.now(),
        status: "transcribing",
        question: "",
        answer: "",
        phase: "轉錄中",
      };
      dispatch({ type: "add", item });

      if (blob.size > 4_000_000) {
        dispatch({
          type: "patch",
          id,
          patch: { status: "error", error: "錄音檔太大（超過 4MB），請縮短錄音", phase: undefined },
        });
        return id;
      }

      try {
        const fd = new FormData();
        fd.append("audio", blob, `question.${ext}`);
        fd.append("ext", ext);
        const res = await apiFetch("/api/transcribe", { method: "POST", body: fd });
        if (!res.ok) throw new Error(await readErrorMessage(res));
        const data = (await res.json()) as {
          raw: string;
          question: string;
          confidence?: QuestionItem["confidence"];
        };
        dispatch({
          type: "patch",
          id,
          patch: {
            raw: data.raw,
            question: data.question,
            confidence: data.confidence,
            status: "ready",
            phase: undefined,
          },
        });
        // 聽不清楚（low）就停在這裡讓人確認或重錄，不要對著錯的問題生出一篇稿
        if (data.confidence === "low") return id;
        // 直接帶入整理好的問題與序號，不依賴 itemsRef 是否已更新
        void answer(id, data.question, item.seq);
      } catch (e) {
        dispatch({
          type: "patch",
          id,
          patch: { status: "error", error: (e as Error).message, phase: undefined },
        });
      }
      return id;
    },
    [answer]
  );

  /** 打字輸入 → 直接開始回答 */
  const addFromText = useCallback(
    (text: string) => {
      const q = text.trim();
      if (!q) return null;
      const id = newId();
      const seq = nextSeq();
      dispatch({
        type: "add",
        item: { id, seq, createdAt: Date.now(), status: "ready", question: q, answer: "" },
      });
      void answer(id, q, seq);
      return id;
    },
    [answer]
  );

  const setQuestion = useCallback((id: string, question: string) => {
    // 人改過的問題就是確定的，把「不確定」提示拿掉
    dispatch({ type: "patch", id, patch: { question, confidence: undefined } });
  }, []);

  const abort = useCallback((id: string) => {
    controllersRef.current.get(id)?.abort();
  }, []);

  const remove = useCallback((id: string) => {
    controllersRef.current.get(id)?.abort();
    controllersRef.current.delete(id);
    dispatch({ type: "remove", id });
  }, []);

  const clear = useCallback(() => {
    controllersRef.current.forEach((ac) => ac.abort());
    controllersRef.current.clear();
    seqRef.current = 0;
    dispatch({ type: "clear" });
  }, []);

  /** 暖機：讓文件進 prompt cache，不會出現在卡片列表 */
  const warmup = useCallback(async () => {
    const res = await apiFetch("/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "（暖機測試）請用一句話介紹我們的專案。", history: [] }),
    });
    if (!res.ok) throw new Error(await readErrorMessage(res));
    // 讀完串流讓後端完整跑完
    const reader = res.body?.getReader();
    if (reader) {
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
      }
    }
  }, []);

  return { items, addFromAudio, addFromText, answer, abort, setQuestion, remove, clear, warmup };
}
