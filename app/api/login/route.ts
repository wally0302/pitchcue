import { NextResponse } from "next/server";
import {
  checkCredentials,
  cookieOptions,
  isLoginConfigured,
  SESSION_COOKIE,
  SESSION_TTL_SEC,
  signSession,
} from "@/lib/session";
import { clearLoginFailures, clientIp, loginBlocked, recordLoginFailure } from "@/lib/login-limit";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

/** POST { email, password } → 成功就發 30 天的 session cookie */
export async function POST(req: Request) {
  if (!isLoginConfigured()) {
    return Response.json(
      { error: "伺服器尚未設定登入：請設定 SESSION_SECRET、LOGIN_PASSWORD、ALLOWED_EMAILS" },
      { status: 503, headers: NO_STORE }
    );
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400, headers: NO_STORE });
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!email || !password) {
    return Response.json({ error: "請輸入 email 與密碼" }, { status: 400, headers: NO_STORE });
  }

  const ip = clientIp(req);
  if (await loginBlocked(ip)) {
    return Response.json({ error: "嘗試次數過多，請 15 分鐘後再試" }, { status: 429, headers: NO_STORE });
  }
  if (!checkCredentials(email, password)) {
    await recordLoginFailure(ip);
    return Response.json({ error: "帳號或密碼錯誤" }, { status: 401, headers: NO_STORE });
  }

  await clearLoginFailures(ip);
  const res = NextResponse.json({ ok: true, email }, { headers: NO_STORE });
  res.cookies.set({ name: SESSION_COOKIE, value: signSession(email), maxAge: SESSION_TTL_SEC, ...cookieOptions(req) });
  return res;
}
