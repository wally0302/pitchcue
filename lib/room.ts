import { getRedis } from "@/lib/redis";
import type { QuestionItem } from "@/lib/types";

export type SyncPayload = {
  upserts?: QuestionItem[];
  removed?: string[];
  clear?: boolean;
};

export type RoomSnapshot = { v: number; items?: QuestionItem[] };

const keys = (code: string) => ({
  items: `room:${code}:items`,
  v: `room:${code}:v`,
});

/** 只保留觀看頁需要的欄位，避免寫進多餘資料 */
function sanitize(it: QuestionItem): QuestionItem | null {
  if (!it || typeof it.id !== "string" || typeof it.seq !== "number") return null;
  return {
    id: it.id,
    seq: it.seq,
    createdAt: Number(it.createdAt) || Date.now(),
    status: it.status,
    raw: typeof it.raw === "string" ? it.raw : undefined,
    question: typeof it.question === "string" ? it.question : "",
    answer: typeof it.answer === "string" ? it.answer : "",
    error: typeof it.error === "string" ? it.error : undefined,
    phase: typeof it.phase === "string" ? it.phase : undefined,
  };
}

export async function applySync(code: string, payload: SyncPayload): Promise<number> {
  const redis = getRedis();
  const k = keys(code);
  const p = redis.pipeline();

  if (payload.clear) p.del(k.items);

  const removed = (payload.removed ?? []).filter((id) => typeof id === "string").slice(0, 100);
  if (removed.length) p.hdel(k.items, ...removed);

  const upserts = (payload.upserts ?? []).map(sanitize).filter((x): x is QuestionItem => !!x).slice(0, 50);
  if (upserts.length) {
    const fields: Record<string, string> = {};
    for (const it of upserts) fields[it.id] = JSON.stringify(it);
    p.hset(k.items, fields);
  }

  p.incr(k.v);
  const results = await p.exec<unknown[]>();
  const v = Number(results[results.length - 1]);
  return Number.isFinite(v) ? v : 0;
}

export async function readRoom(code: string, sinceV: number): Promise<RoomSnapshot> {
  const redis = getRedis();
  const k = keys(code);
  const rawV = await redis.get<string>(k.v);
  const v = Number(rawV ?? 0) || 0;
  if (v === sinceV) return { v };

  const hash = (await redis.hgetall<Record<string, string>>(k.items)) ?? {};
  const items: QuestionItem[] = [];
  for (const val of Object.values(hash)) {
    try {
      const parsed = typeof val === "string" ? JSON.parse(val) : val;
      const it = sanitize(parsed as QuestionItem);
      if (it) items.push(it);
    } catch {}
  }
  items.sort((a, b) => a.seq - b.seq);
  return { v, items };
}
