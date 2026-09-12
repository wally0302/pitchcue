import type OpenAI from "openai";
import { getOpenAI, MODELS, PROMPT_CACHE_KEY } from "@/lib/openai";
import { checkAuth } from "@/lib/auth";
import { ANSWER_SYSTEM } from "@/lib/prompts";
import type { HistoryPair } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_HISTORY = 8;

export async function POST(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;

  let body: { question?: string; history?: HistoryPair[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const question = (body.question ?? "").trim();
  if (!question) return Response.json({ error: "沒有問題內容" }, { status: 400 });
  const history = (body.history ?? [])
    .filter((h) => h && h.q && h.a)
    .slice(-MAX_HISTORY);

  const input: OpenAI.Responses.ResponseInputItem[] = [
    // 固定的大區塊放最前面，命中 prompt cache
    { role: "developer", content: [{ type: "input_text", text: ANSWER_SYSTEM }] },
    ...history.flatMap(({ q, a }) => [
      { role: "user" as const, content: q },
      { role: "assistant" as const, content: a },
    ]),
    { role: "user", content: question },
  ];

  let stream: AsyncIterable<OpenAI.Responses.ResponseStreamEvent>;
  try {
    const openai = getOpenAI();
    stream = await openai.responses.create(
      {
        model: MODELS.chat,
        reasoning: { effort: "none" },
        input,
        stream: true,
        max_output_tokens: 900,
        prompt_cache_key: PROMPT_CACHE_KEY,
        store: false,
      },
      { signal: req.signal }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[answer] create failed:", msg);
    return Response.json({ error: `回答生成失敗：${msg}` }, { status: 500 });
  }

  const enc = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const ev of stream) {
          if (ev.type === "response.output_text.delta") {
            controller.enqueue(enc.encode(ev.delta));
          } else if (ev.type === "error") {
            controller.enqueue(enc.encode(`\n\n[錯誤] ${ev.message}`));
          } else if (ev.type === "response.completed") {
            const u = ev.response.usage;
            if (u) {
              console.log(
                `[answer] tokens in=${u.input_tokens} cached=${u.input_tokens_details?.cached_tokens ?? 0} out=${u.output_tokens}`
              );
            }
          }
        }
      } catch (e) {
        if (!(e instanceof Error && e.name === "AbortError")) {
          controller.enqueue(enc.encode(`\n\n[錯誤] ${(e as Error).message}`));
        }
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
