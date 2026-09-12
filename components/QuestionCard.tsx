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

export function QuestionCard({ item, latest, readOnly = false, onAnswer, onAbort, onChangeQuestion, onRemove }: Props) {
  const [wasLatest, setWasLatest] = useState(latest);
  // 問題文字平常是靜態的，點一下才變成可編輯，避免手機誤觸跳出鍵盤
  const [editing, setEditing] = useState(false);
  const busy = item.status === "transcribing" || item.status === "answering";
  const canAnswer = item.status !== "transcribing" && item.question.trim().length > 0;
  const canEdit = !readOnly && !!onChangeQuestion && item.status !== "transcribing";

  // 新題進來時，舊題結束編輯（所有題目永遠全部展開，沒有收起功能）
  if (wasLatest !== latest) {
    setWasLatest(latest);
    if (!latest) setEditing(false);
  }

  const showRaw = item.raw && item.raw !== item.question;
  // 整理模型聽不清楚：low 與 medium 都照常生成，只是用不同強度的提示提醒對一下問題
  const unclear = item.confidence === "low" && item.status !== "error";
  const unsure = item.confidence === "medium" && item.status !== "error";

  return (
    <section className={`card ${latest ? "card-latest" : ""}`}>
      <header className="card-head">
        <span className="card-seq">Q{item.seq}</span>
        <span className={`status ${item.status === "error" ? "status-error" : ""}`}>
          {busy && <span className="spinner" aria-hidden />}
          {item.phase ?? STATUS_LABEL[item.status]}
        </span>
        <span className="flex-1" />
        {!readOnly && onRemove && (
          <button type="button" className="btn-text" onClick={() => onRemove(item.id)}>
            刪除
          </button>
        )}
      </header>

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
            辨識不太清楚，已先生成；講之前對一下問題文字，不對就點問題修改再「重新生成」。
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
    </section>
  );
}
