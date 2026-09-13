import { NextResponse } from "next/server";
import { cookieOptions, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set({ name: SESSION_COOKIE, value: "", maxAge: 0, ...cookieOptions(req) });
  return res;
}
