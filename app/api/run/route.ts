import { NextResponse } from "next/server";
import { PROVIDERS, runText, runImage, type ProviderId } from "@/lib/providers";
import { ANSWER_SYSTEM_BASE, contextBlock, type ProjectCtx } from "@/lib/prompts";

export const maxDuration = 120;

// One call per model — the browser fires these in parallel so each card fills as it lands.
export async function POST(req: Request) {
  const { provider, mode, prompt, project, presetNote } = ((await req.json().catch(() => ({}))) ?? {}) as {
    provider: ProviderId; mode: "text" | "image"; prompt: string; project?: ProjectCtx | null; presetNote?: string;
  };
  if (!PROVIDERS[provider]) return NextResponse.json({ error: "Unknown AI" }, { status: 400 });
  if (!prompt?.trim()) return NextResponse.json({ error: "Empty prompt" }, { status: 400 });
  if (mode === "image") {
    // Non-image models get the style rules as guidance; image models get the prompt as-is
    // (a sharpened brief already carries the style; a raw idea is sent raw so the model interprets it).
    return NextResponse.json(await runImage(provider, prompt, presetNote));
  }
  const system = [ANSWER_SYSTEM_BASE, contextBlock(project, presetNote)].filter(Boolean).join("\n\n");
  return NextResponse.json(await runText(provider, system, prompt));
}
