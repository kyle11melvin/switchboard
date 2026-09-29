import { NextResponse } from "next/server";
import { runText, runImage, type ProviderId } from "@/lib/providers";
import { ANSWER_SYSTEM_BASE, contextBlock, type ProjectCtx } from "@/lib/prompts";

export const maxDuration = 120;

// One call per model — the browser fires these in parallel so each card fills as it lands.
export async function POST(req: Request) {
  const { provider, mode, prompt, project, presetNote } = (await req.json()) as {
    provider: ProviderId; mode: "text" | "image"; prompt: string; project?: ProjectCtx | null; presetNote?: string;
  };
  if (!prompt?.trim()) return NextResponse.json({ error: "Empty prompt" }, { status: 400 });
  if (mode === "image") return NextResponse.json(await runImage(provider, prompt));
  const system = [ANSWER_SYSTEM_BASE, contextBlock(project, presetNote)].filter(Boolean).join("\n\n");
  return NextResponse.json(await runText(provider, system, prompt));
}
