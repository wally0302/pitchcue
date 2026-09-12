export type QuestionStatus =
  | "transcribing"
  | "ready"
  | "answering"
  | "done"
  | "error";

export type QuestionItem = {
  id: string;
  seq: number;
  createdAt: number;
  status: QuestionStatus;
  /** 原始逐字稿（打字輸入時沒有） */
  raw?: string;
  /** 整理後的問題（可編輯） */
  question: string;
  /** 整理模型對「這是不是評審的問題」的信心；low 不會自動生成回答 */
  confidence?: "high" | "medium" | "low";
  /** 串流累積的回答（markdown） */
  answer: string;
  error?: string;
  /** 轉錄階段的細部提示 */
  phase?: string;
};

export type HistoryPair = { q: string; a: string };
