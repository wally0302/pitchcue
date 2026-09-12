import OpenAI from "openai";

let client: OpenAI | null = null;

/** 延遲建立，避免 build 階段（沒有 env）就初始化 */
export function getOpenAI(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("缺少 OPENAI_API_KEY 環境變數");
    client = new OpenAI({ apiKey });
  }
  return client;
}

export const MODELS = {
  transcribe: process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-transcribe",
  clean: process.env.OPENAI_CLEAN_MODEL || "gpt-5.6-luna",
  chat: process.env.OPENAI_CHAT_MODEL || "gpt-5.6-terra",
} as const;

/** 部署後改了 data/ 內容時把這個值往上加，避免命中舊快取路由 */
export const PROMPT_CACHE_KEY = process.env.PROMPT_CACHE_KEY || "hackathon-qa-v1";
