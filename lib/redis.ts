import { Redis } from "@upstash/redis";

function creds() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

/** 是否設定了 Upstash Redis（沒有就關閉組員共享功能） */
export function isRoomConfigured(): boolean {
  return creds() !== null;
}

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    const c = creds();
    if (!c) throw new Error("room_not_configured");
    client = new Redis({ url: c.url, token: c.token, automaticDeserialization: false });
  }
  return client;
}

export function roomCode(): string {
  return process.env.ROOM_CODE || "demo";
}
