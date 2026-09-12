import { roomCode } from "@/lib/redis";

/** 若設定 APP_PASSWORD，API 需帶 x-app-key header；未設定則放行 */
export function checkAuth(req: Request): Response | null {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return null;
  const got = req.headers.get("x-app-key") ?? "";
  if (got === expected) return null;
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

/** 觀看頁：?code= 必須等於 ROOM_CODE（預設 demo） */
export function checkRoomCode(req: Request): Response | null {
  const url = new URL(req.url);
  const got = url.searchParams.get("code") ?? "";
  if (got && got === roomCode()) return null;
  return Response.json({ error: "invalid_room_code" }, { status: 401 });
}
