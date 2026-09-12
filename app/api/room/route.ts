import { checkAuth, checkRoomCode } from "@/lib/auth";
import { isRoomConfigured, roomCode } from "@/lib/redis";
import { applySync, readRoom, type SyncPayload } from "@/lib/room";

export const runtime = "nodejs";
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };

function notConfigured() {
  return Response.json({ error: "room_not_configured" }, { status: 503, headers: NO_STORE });
}

/** 觀看頁輪詢：?code=&v= */
export async function GET(req: Request) {
  const denied = checkRoomCode(req);
  if (denied) return denied;
  if (!isRoomConfigured()) return notConfigured();

  const url = new URL(req.url);
  const sinceV = Number(url.searchParams.get("v") ?? -1);
  try {
    const snap = await readRoom(roomCode(), Number.isFinite(sinceV) ? sinceV : -1);
    return Response.json(snap, { headers: NO_STORE });
  } catch (e) {
    console.error("[room] read failed:", e);
    return Response.json({ error: "read_failed" }, { status: 500, headers: NO_STORE });
  }
}

/** 主控端同步：{ upserts, removed, clear } */
export async function POST(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;
  if (!isRoomConfigured()) return notConfigured();

  let body: SyncPayload;
  try {
    body = (await req.json()) as SyncPayload;
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const payload: SyncPayload = {
    upserts: Array.isArray(body.upserts) ? body.upserts : [],
    removed: Array.isArray(body.removed) ? body.removed : [],
    clear: body.clear === true,
  };
  if (!payload.clear && !payload.upserts!.length && !payload.removed!.length) {
    return Response.json({ error: "empty" }, { status: 400 });
  }
  try {
    const v = await applySync(roomCode(), payload);
    return Response.json({ v }, { headers: NO_STORE });
  } catch (e) {
    console.error("[room] sync failed:", e);
    return Response.json({ error: "sync_failed" }, { status: 500, headers: NO_STORE });
  }
}
