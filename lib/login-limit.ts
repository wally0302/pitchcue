import { getRedis, isRoomConfigured } from "@/lib/redis";

/**
 * 登入防暴力：每個 IP 15 分鐘內錯 10 次就擋。
 * 只在 POST /api/login 執行（閒置零流量）；沒設 Redis 就略過；Redis 出錯不擋登入。
 */
const MAX_FAILURES = 10;
const WINDOW_SEC = 15 * 60;
const key = (ip: string) => `login:fail:${ip}`;

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function loginBlocked(ip: string): Promise<boolean> {
  if (!isRoomConfigured()) return false;
  try {
    const n = Number((await getRedis().get<string>(key(ip))) ?? 0);
    return n >= MAX_FAILURES;
  } catch {
    return false;
  }
}

export async function recordLoginFailure(ip: string): Promise<void> {
  if (!isRoomConfigured()) return;
  try {
    const r = getRedis();
    const n = await r.incr(key(ip));
    if (n === 1) await r.expire(key(ip), WINDOW_SEC);
  } catch {}
}

export async function clearLoginFailures(ip: string): Promise<void> {
  if (!isRoomConfigured()) return;
  try {
    await getRedis().del(key(ip));
  } catch {}
}
