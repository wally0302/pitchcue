import { requireSession } from "@/lib/auth";
import { isRoomConfigured, roomCode } from "@/lib/redis";

export const runtime = "nodejs";

/** 主控端取得觀看連結用的 code（需密碼） */
export async function GET(req: Request) {
  const denied = requireSession(req);
  if (denied) return denied;
  return Response.json(
    { configured: isRoomConfigured(), code: isRoomConfigured() ? roomCode() : null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
