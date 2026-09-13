import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * 單人登入的 session：HMAC 簽名 cookie，不用 DB。
 * 這個檔案給 proxy.ts 與 route handler 共用，不能 import next/headers 或 @upstash/redis。
 */
export const SESSION_COOKIE = "pitchcue_session";
export const SESSION_TTL_SEC = 30 * 24 * 60 * 60;

export type Session = { email: string; exp: number };

const secret = () => process.env.SESSION_SECRET ?? "";
const password = () => process.env.LOGIN_PASSWORD ?? "";

/** ALLOWED_EMAILS：逗號分隔，比對時 trim + 小寫 */
export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** 三個變數都有才算「已設定」；缺任何一個一律拒絕（fail closed） */
export function isLoginConfigured(): boolean {
  return secret().length >= 16 && password().length > 0 && allowedEmails().length > 0;
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const mac = (data: string) => createHmac("sha256", secret()).update(data).digest();

/** 長度不同也走等時比較：先各自 sha256 再 timingSafeEqual */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkCredentials(email: string, pw: string): boolean {
  if (!isLoginConfigured()) return false;
  const okEmail = allowedEmails().includes(email.trim().toLowerCase());
  const okPw = safeEqual(pw, password());
  return okEmail && okPw; // 兩個都算完再合併，不短路
}

export function signSession(email: string, now = Date.now()): string {
  const payload = b64u(JSON.stringify({ v: 1, e: email.trim().toLowerCase(), x: now + SESSION_TTL_SEC * 1000 }));
  return `${payload}.${b64u(mac(payload))}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): Session | null {
  if (!token || !isLoginConfigured()) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = Buffer.from(token.slice(dot + 1), "base64url");
  const expect = mac(payload);
  if (sig.length !== expect.length || !timingSafeEqual(sig, expect)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString()) as { v?: unknown; e?: unknown; x?: unknown };
    if (p.v !== 1 || typeof p.e !== "string" || typeof p.x !== "number" || p.x <= now) return null;
    if (!allowedEmails().includes(p.e)) return null; // 事後從名單移除也立即失效
    return { email: p.e, exp: p.x };
  } catch {
    return null;
  }
}

/** 同時給 proxy（NextRequest）與 route handler（Request）用：直接解析 Cookie 標頭 */
export function readSession(req: Request): Session | null {
  const header = req.headers.get("cookie") ?? "";
  const m = header.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`));
  return verifySessionToken(m?.[1]);
}

/** 本機 http 不加 secure，Vercel（https / x-forwarded-proto）自動加 */
export function cookieOptions(req: Request) {
  const https = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  return { httpOnly: true, sameSite: "lax" as const, path: "/", secure: https };
}

/** 只允許站內路徑，避免 open redirect */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/";
}
