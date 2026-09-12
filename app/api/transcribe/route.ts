import { toFile } from "openai";
import { getOpenAI, MODELS } from "@/lib/openai";
import { checkAuth } from "@/lib/auth";
import { GLOSSARY_TERMS } from "@/lib/knowledge.generated";
import { TRANSCRIBE_PROMPT, CLEAN_INSTRUCTIONS, cleanInput } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "無法讀取音檔" }, { status: 400 });
  }
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size < 1000) {
    return Response.json({ error: "沒有錄到聲音，請再試一次" }, { status: 400 });
  }
  const ext = String(form.get("ext") || "webm").replace(/[^a-z0-9]/gi, "") || "webm";
  const mime = (audio.type || "audio/webm").split(";")[0];

  try {
    const openai = getOpenAI();
    const file = await toFile(Buffer.from(await audio.arrayBuffer()), `question.${ext}`, {
      type: mime,
    });
    const t = await openai.audio.transcriptions.create({
      model: MODELS.transcribe,
      file,
      languages: ["zh-tw", "en"],
      keywords: GLOSSARY_TERMS.slice(0, 50),
      prompt: TRANSCRIBE_PROMPT,
    });
    const raw = (t.text ?? "").trim();
    if (!raw) {
      return Response.json({ error: "沒有辨識到內容，請再試一次" }, { status: 422 });
    }

    // 整理成清楚的問題；失敗就退回原始逐字稿
    let question = raw;
    try {
      const r = await openai.responses.create({
        model: MODELS.clean,
        reasoning: { effort: "none" },
        instructions: CLEAN_INSTRUCTIONS,
        input: cleanInput(raw),
        max_output_tokens: 300,
        store: false,
      });
      const cleaned = r.output_text?.trim();
      if (cleaned) question = cleaned;
    } catch (e) {
      console.error("[transcribe] clean failed:", e);
    }

    return Response.json({ raw, question });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[transcribe] failed:", msg);
    return Response.json({ error: `語音辨識失敗：${msg}` }, { status: 500 });
  }
}
