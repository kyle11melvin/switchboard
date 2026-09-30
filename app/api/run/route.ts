import { NextResponse } from "next/server";
import { PROVIDERS, runText, runImage, type ProviderId } from "@/lib/providers";
import { readPhotos } from "@/lib/photos";
import { keepAlive } from "@/lib/stream";
import { ANSWER_SYSTEM_BASE, contextBlock, type ProjectCtx } from "@/lib/prompts";

export const maxDuration = 180;

// One call per model — the browser fires these in parallel so each card fills as it lands.
export async function POST(req: Request) {
  const { provider, mode, prompt, project, presetNote, photos: raw } = ((await req.json().catch(() => ({}))) ?? {}) as {
    provider: ProviderId; mode: "text" | "image"; prompt: string; project?: ProjectCtx | null; presetNote?: string; photos?: unknown;
  };
  const photos = readPhotos(raw);
  if (!PROVIDERS[provider]) return NextResponse.json({ error: "Unknown AI" }, { status: 400 });
  if (!prompt?.trim()) return NextResponse.json({ error: "Empty prompt" }, { status: 400 });
  if (mode === "image") {
    // Non-image models get the style rules as guidance; image models get the prompt as-is
    // (a sharpened brief already carries the style; a raw idea is sent raw so the model interprets it).
    return keepAlive(`run ${provider} image${photos.length ? ` with ${photos.length} photo${photos.length === 1 ? "" : "s"}` : ""}`, () => runImage(provider, prompt, presetNote, photos));
  }
  const system = [ANSWER_SYSTEM_BASE, contextBlock(project, presetNote)].filter(Boolean).join("\n\n");
  return keepAlive(`run ${provider} text`, () => runText(provider, system, prompt, photos));
}
