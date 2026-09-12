"use client";

import { useEffect, useRef } from "react";
import type { QuestionItem } from "@/lib/types";
import { QuestionCard } from "@/components/QuestionCard";

type Props = {
  items: QuestionItem[];
  /** 是否展開舊題清單（由 ⋯ 選單的「歷史」切換） */
  showHistory: boolean;
  emptyText: string;
  readOnly?: boolean;
  onAnswer?: (id: string) => void;
  onAbort?: (id: string) => void;
  onChangeQuestion?: (id: string, q: string) => void;
  onRemove?: (id: string) => void;
};

export function latestOf(items: QuestionItem[]): QuestionItem | null {
  return items.reduce<QuestionItem | null>((m, it) => (!m || it.seq > m.seq ? it : m), null);
}

/**
 * 閱讀畫面：主控頁與觀看頁共用。
 * 平常只顯示最新一題佔滿畫面；「歷史」打開才把舊題（收起）列在下面。
 */
export function Stage({ items, showHistory, emptyText, readOnly, onAnswer, onAbort, onChangeQuestion, onRemove }: Props) {
  const latest = latestOf(items);
  const historyRef = useRef<HTMLParagraphElement>(null);

  // 最新一題通常佔滿一屏，歷史打開時把清單捲進視野
  useEffect(() => {
    if (showHistory) historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showHistory]);

  if (!latest) return <p className="empty">{emptyText}</p>;

  const older = items.filter((it) => it.id !== latest.id).sort((a, b) => b.seq - a.seq);

  return (
    <div className="flex flex-col gap-3">
      <QuestionCard
        key={latest.id}
        item={latest}
        latest
        readOnly={readOnly}
        onAnswer={onAnswer}
        onAbort={onAbort}
        onChangeQuestion={onChangeQuestion}
      />
      {showHistory && older.length > 0 && (
        <>
          <p className="section-label" ref={historyRef}>
            歷史
          </p>
          {older.map((item) => (
            <QuestionCard
              key={item.id}
              item={item}
              latest={false}
              defaultCollapsed
              readOnly={readOnly}
              onAnswer={onAnswer}
              onAbort={onAbort}
              onChangeQuestion={onChangeQuestion}
              onRemove={onRemove}
            />
          ))}
        </>
      )}
      {showHistory && older.length === 0 && (
        <p className="section-label" ref={historyRef}>
          還沒有更早的題目
        </p>
      )}
    </div>
  );
}
