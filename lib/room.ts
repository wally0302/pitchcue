import { getRedis } from "@/lib/redis";
import type { QuestionItem } from "@/lib/types";

export type SyncPayload = {
  upserts?: QuestionItem[];
  removed?: string[];
  clear?: boolean;
  /** 主控端按「結束本場」：組員頁收到後停止輪詢；之後任何寫入會自動重新開啟 */
  close?: boolean;
};

export type RoomSnapshot = { v: number; closed: boolean; items?: QuestionItem[] };

/** 房間資料最後一次寫入後多久自動消失（第三層保護：就算沒按結束、沒關分頁，資料也不會永遠留著） */
const ROOM_TTL_SEC = 6 * 60 * 60;

const keys = (code: string) => ({
  items: `room:${code}:items`,
  v: `room:${code}:v`,
  closed: `room:${code}:closed`,
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

  // 結束 → 立旗標；任何其他寫入 → 拿掉旗標（主控端結束後又錄下一題，房間自動重新開啟）
  if (payload.close) p.set(k.closed, "1");
  else p.del(k.closed);

  p.expire(k.items, ROOM_TTL_SEC);
  p.expire(k.closed, ROOM_TTL_SEC);
  p.incr(k.v);
  p.expire(k.v, ROOM_TTL_SEC);
  const results = await p.exec<unknown[]>();
  // incr 是倒數第二個指令
  const v = Number(results[results.length - 2]);
  return Number.isFinite(v) ? v : 0;
}

export async function readRoom(code: string, sinceV: number): Promise<RoomSnapshot> {
  const redis = getRedis();
  const k = keys(code);
  const [rawV, rawClosed] = await redis.mget<[string | null, string | null]>(k.v, k.closed);
  const v = Number(rawV ?? 0) || 0;
  const closed = rawClosed === "1";
  if (v === sinceV) return { v, closed };

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
  return { v, closed, items };
}
