import { hasKey, openai } from "@/server/agent/client";

// Voice typing fallback: the phone records a short clip, we turn it into text. Used where the browser's own
// speech recognition is missing or returns nothing (many phones).
export async function POST(req: Request) {
  try {
    if (!hasKey()) return Response.json({ error: "Voice typing needs an OpenAI key. Add one in Settings." }, { status: 400 });
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) return Response.json({ error: "No audio received." }, { status: 400 });
    const res = await openai().audio.transcriptions.create({ file: audio, model: "gpt-4o-mini-transcribe" });
    return Response.json({ text: res.text ?? "" });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
