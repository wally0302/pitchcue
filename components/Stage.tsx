"use client";

import type { QuestionItem } from "@/lib/types";
import { QuestionCard } from "@/components/QuestionCard";

type Props = {
  items: QuestionItem[];
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
 * 最新一題在最上面，舊題依序全部展開列在下面，一眼看到整場所有題目；沒有收起功能。
 */
export function Stage({ items, emptyText, readOnly, onAnswer, onAbort, onChangeQuestion, onRemove }: Props) {
  const latest = latestOf(items);

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
      {older.length > 0 && (
        <>
          <p className="section-label">歷史</p>
          {older.map((item) => (
            <QuestionCard
              key={item.id}
              item={item}
              latest={false}
              readOnly={readOnly}
              onAnswer={onAnswer}
              onAbort={onAbort}
              onChangeQuestion={onChangeQuestion}
              onRemove={onRemove}
            />
          ))}
        </>
      )}
    </div>
  );
}
