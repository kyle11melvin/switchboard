import { NextResponse } from "next/server";
import { runText, defaultBrain, type ProviderId } from "@/lib/providers";
import { keepAlive } from "@/lib/stream";
import { BRIEF_SYSTEM, contextBlock, type ProjectCtx } from "@/lib/prompts";
import { readPhotos } from "@/lib/photos";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { idea, mode, project, presetNote, brain, photos: raw } = ((await req.json().catch(() => ({}))) ?? {}) as {
    idea: string; mode: "text" | "image"; project?: ProjectCtx | null; presetNote?: string; brain?: ProviderId; photos?: unknown;
  };
  const photos = readPhotos(raw);
  if (!idea?.trim()) return NextResponse.json({ error: "Empty idea" }, { status: 400 });
  const ctx = contextBlock(project, presetNote);
  const system = [BRIEF_SYSTEM, ctx].filter(Boolean).join("\n\n");
  const photoNote = photos.length
    ? `\n[${photos.length} photo${photos.length === 1 ? " is" : "s are"} attached and shown above. ${mode === "image" ? "The image models will receive the same photos as reference. In the prompt, refer to the subjects as they appear in the photos and describe them precisely (who or what they are, colors, markings, clothing) so a model without the photos could still get them right." : "Use what is in them."}]`
    : "";
  const prompt = `${mode === "image" ? "[This is an IMAGE request]\n" : ""}IDEA:\n${idea}${photoNote}`;
  return keepAlive(`brief ${brain || defaultBrain()}`, async () => {
    const r = await runText(brain || defaultBrain(), system, prompt, photos);
    if (r.error) return { error: `${r.provider}: ${r.error}` };
    return { brief: r.text, model: r.model };
  });
}
