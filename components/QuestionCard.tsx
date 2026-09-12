"use client";

import { useState } from "react";
import type { QuestionItem } from "@/lib/types";
import { AnswerView } from "./AnswerView";

type Props = {
  item: QuestionItem;
  latest: boolean;
  /** 觀看頁：只顯示，不能操作 */
  readOnly?: boolean;
  /** 預設是否收起（歷史清單裡的舊題收起，最新一題展開） */
  defaultCollapsed?: boolean;
  onAnswer?: (id: string) => void;
  onAbort?: (id: string) => void;
  onChangeQuestion?: (id: string, q: string) => void;
  /** 只有歷史清單會傳入；台上的最新一題沒有刪除鈕 */
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
  defaultCollapsed = false,
  onAnswer,
  onAbort,
  onChangeQuestion,
  onRemove,
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [wasLatest, setWasLatest] = useState(latest);
  // 問題文字平常是靜態的，點一下才變成可編輯，避免手機誤觸跳出鍵盤
  const [editing, setEditing] = useState(false);
  const busy = item.status === "transcribing" || item.status === "answering";
  const canAnswer = item.status !== "transcribing" && item.question.trim().length > 0;
  const canEdit = !readOnly && !!onChangeQuestion && item.status !== "transcribing";

  // 新題進來時，舊題自動收起、結束編輯
  if (wasLatest !== latest) {
    setWasLatest(latest);
    if (!latest) {
      setCollapsed(true);
      setEditing(false);
    }
  }

  const showRaw = item.raw && item.raw !== item.question;
  // 整理模型聽不清楚：low 停在待回答讓人決定；medium 照常生成但提醒對一下問題
  const unclear = item.status === "ready" && !item.answer && item.confidence === "low";
  const unsure = item.confidence === "medium" && item.status !== "error";

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
          ) : editing && canEdit ? (
            <textarea
              className="question-input"
              value={item.question}
              rows={2}
              autoFocus
              placeholder="評審提問"
              onChange={(e) => onChangeQuestion?.(item.id, e.target.value)}
              onBlur={() => setEditing(false)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canAnswer) {
                  e.preventDefault();
                  setEditing(false);
                  onAnswer?.(item.id);
                }
              }}
            />
          ) : canEdit ? (
            <button
              type="button"
              className="question-static question-tap"
              title="點一下修改問題"
              onClick={() => setEditing(true)}
            >
              {item.question || "（點一下輸入問題）"}
            </button>
          ) : (
            <p className="question-static">{item.question || "（尚無內容）"}</p>
          )}
          {showRaw && <p className="raw">原始逐字稿：{item.raw}</p>}
          {unclear && (
            <p className="hint hint-warn">
              沒聽清楚評審在問什麼。點問題文字修改後按「生成回答」，或按上方「錄下一題」、對著手機複述一次評審的問題。
            </p>
          )}
          {unsure && !unclear && <p className="hint">整理時不太確定，講之前先對一下問題是不是評審問的。</p>}

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
                  className="btn btn-secondary btn-sm"
                  disabled={!canAnswer}
                  onClick={() => {
                    setEditing(false);
                    onAnswer?.(item.id);
                  }}
                >
                  {item.status === "ready" ? "生成回答" : "重新生成"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
