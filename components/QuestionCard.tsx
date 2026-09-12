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

function Chevron() {
  return (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function QuestionCard({
  item,
  latest,
  readOnly = false,
  onAnswer,
  onAbort,
  onChangeQuestion,
  onRemove,
}: Props) {
  const [collapsed, setCollapsed] = useState(!latest);
  const [wasLatest, setWasLatest] = useState(latest);
  const busy = item.status === "transcribing" || item.status === "answering";
  const canAnswer = item.status !== "transcribing" && item.question.trim().length > 0;

  // 新題進來時，舊題自動收起，手機上一屏看得到當前題
  if (wasLatest !== latest) {
    setWasLatest(latest);
    if (!latest) setCollapsed(true);
  }

  const showRaw = item.raw && item.raw !== item.question;

  return (
    <section className={`card ${latest ? "card-latest" : ""}`}>
      <header className="card-head">
        <button
          type="button"
          className="card-seq"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
        >
          Q{item.seq}
          <Chevron />
        </button>
        <span className={`status ${item.status === "error" ? "status-error" : ""}`}>
          {busy && <span className="spinner" aria-hidden />}
          {item.phase ?? STATUS_LABEL[item.status]}
        </span>
        {collapsed && item.question && (
          <span className="truncate text-sm text-ink-2 min-w-0">{item.question}</span>
        )}
        <span className="flex-1" />
        {!readOnly && onRemove && (
          <button type="button" className="btn-text" onClick={() => onRemove(item.id)}>
            刪除
          </button>
        )}
      </header>

      {!collapsed && (
        <div className="card-body">
          {item.status === "transcribing" ? (
            <p className="text-ink-2">正在把評審的問題轉成文字…</p>
          ) : readOnly ? (
            <p className="question-static">{item.question || "（尚無內容）"}</p>
          ) : (
            <textarea
              className="question-input"
              value={item.question}
              rows={2}
              placeholder="評審提問，可直接修改"
              onChange={(e) => onChangeQuestion?.(item.id, e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canAnswer) {
                  e.preventDefault();
                  onAnswer?.(item.id);
                }
              }}
            />
          )}
          {showRaw && <p className="raw">原始逐字稿：{item.raw}</p>}

          {item.error && <p className="status status-error mt-2">{item.error}</p>}

          {(item.answer || item.status === "answering") && (
            <>
              <hr className="card-rule" />
              <AnswerView markdown={item.answer} streaming={item.status === "answering"} />
            </>
          )}

          {!readOnly && (
            <div className="mt-4">
              {item.status === "answering" ? (
                <button type="button" className="btn btn-danger w-full sm:w-auto" onClick={() => onAbort?.(item.id)}>
                  停止
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary w-full sm:w-auto"
                  disabled={!canAnswer}
                  onClick={() => onAnswer?.(item.id)}
                >
                  {item.status === "done" || item.status === "error" ? "重新生成" : "生成回答"}
                  <span className="kbd">⌘ Enter</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
