"use client";

import { useState } from "react";
import type { QuestionItem } from "@/lib/types";
import { AnswerView } from "./AnswerView";

type Props = {
  item: QuestionItem;
  latest: boolean;
  /** 觀看頁：只顯示，不能操作 */
  readOnly?: boolean;
  onAnswer?: (id: string) => void;
  onAbort?: (id: string) => void;
  onChangeQuestion?: (id: string, q: string) => void;
  onRemove?: (id: string) => void;
};

const STATUS_LABEL: Record<QuestionItem["status"], string> = {
  transcribing: "轉錄中",
  ready: "待回答",
  answering: "生成回答中",
  done: "完成",
  error: "錯誤",
};

export function QuestionCard({
  item,
  latest,
  readOnly = false,
  onAnswer,
  onAbort,
  onChangeQuestion,
  onRemove,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const busy = item.status === "transcribing" || item.status === "answering";
  const canAnswer = item.status !== "transcribing" && item.question.trim().length > 0;

  return (
    <section
      className={`card ${busy ? "card-busy" : ""} ${latest ? "card-latest" : ""} ${
        item.status === "error" ? "card-error" : ""
      }`}
    >
      <header className="flex items-center gap-3 mb-3">
        <button
          type="button"
          className="text-2xl font-bold tracking-wide text-amber-300 hover:text-amber-200"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "展開" : "摺疊"}
        >
          Q{item.seq} {collapsed ? "▸" : "▾"}
        </button>
        <span className={`badge badge-${item.status}`}>{item.phase ?? STATUS_LABEL[item.status]}</span>
        {busy && <span className="spinner" aria-hidden />}
        <span className="flex-1" />
        {!readOnly && onRemove && (
          <button type="button" className="btn-ghost text-sm" onClick={() => onRemove(item.id)} title="刪除這題">
            刪除
          </button>
        )}
      </header>

      {!collapsed && (
        <>
          {item.status === "transcribing" ? (
            <p className="text-xl text-zinc-300">正在把評審的問題轉成文字…</p>
          ) : readOnly ? (
            <>
              <p className="text-sm text-zinc-400 mb-1">評審提問</p>
              <p className="question-static">{item.question || "（尚無內容）"}</p>
              {item.raw && item.raw !== item.question && (
                <p className="text-sm text-zinc-500 mt-1">原始逐字稿：{item.raw}</p>
              )}
            </>
          ) : (
            <>
              <label className="block text-sm text-zinc-400 mb-1">評審提問（可直接修改）</label>
              <textarea
                className="question-input"
                value={item.question}
                rows={2}
                onChange={(e) => onChangeQuestion?.(item.id, e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canAnswer) {
                    e.preventDefault();
                    onAnswer?.(item.id);
                  }
                }}
              />
              {item.raw && item.raw !== item.question && (
                <p className="text-sm text-zinc-500 mt-1">原始逐字稿：{item.raw}</p>
              )}
            </>
          )}

          {item.error && <p className="text-red-300 text-lg mt-2">⚠ {item.error}</p>}

          {!readOnly && (
            <div className="flex flex-wrap items-center gap-3 mt-3">
              {item.status === "answering" ? (
                <button type="button" className="btn btn-danger" onClick={() => onAbort?.(item.id)}>
                  ■ 停止
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canAnswer}
                  onClick={() => onAnswer?.(item.id)}
                >
                  {item.status === "done" || item.status === "error" ? "↻ 重新回答" : "▶ 回答"}
                  <span className="kbd">⌘/Ctrl + Enter</span>
                </button>
              )}
            </div>
          )}

          {(item.answer || item.status === "answering") && (
            <div className="mt-4">
              <AnswerView markdown={item.answer} streaming={item.status === "answering"} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
