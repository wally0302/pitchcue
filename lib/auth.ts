import { roomCode } from "@/lib/redis";
import { readSession } from "@/lib/session";

/** 主控端 API：需要有效的登入 cookie（proxy 已先擋一次，這裡是第二道，不可省略） */
export function requireSession(req: Request): Response | null {
  if (readSession(req)) return null;
  return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
}

/** 觀看頁：?code= 必須等於 ROOM_CODE（預設 demo） */
export function checkRoomCode(req: Request): Response | null {
  const url = new URL(req.url);
  const got = url.searchParams.get("code") ?? "";
  if (got && got === roomCode()) return null;
  return Response.json({ error: "invalid_room_code" }, { status: 401 });
}
