import { NextResponse, type NextRequest } from "next/server";
import { readSession, safeNext } from "@/lib/session";

/**
 * 路由保護（Next 16 的 proxy，舊名 middleware）。
 * 只列出要管的路徑：/view、/_next、public/ 等完全不經過這裡。
 * 這層只是第一道；route handler 內還有 requireSession 二次檢查。
 */
export const config = {
  matcher: ["/", "/login", "/api/transcribe", "/api/answer", "/api/room", "/api/room/link"],
};

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = readSession(req);

  // 已登入就別再看登入頁
  if (pathname === "/login") {
    if (!session) return NextResponse.next();
    return NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get("next")), req.url));
  }

  // 組員觀看頁輪詢：GET /api/room 只靠房間代碼（route 內 checkRoomCode）
  if (pathname === "/api/room" && req.method === "GET") return NextResponse.next();

  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const login = new URL("/login", req.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}
