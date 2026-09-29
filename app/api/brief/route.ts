import { NextResponse } from "next/server";
import { runText, defaultBrain, type ProviderId } from "@/lib/providers";
import { BRIEF_SYSTEM, contextBlock, type ProjectCtx } from "@/lib/prompts";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { idea, mode, project, presetNote, brain } = (await req.json()) as {
    idea: string; mode: "text" | "image"; project?: ProjectCtx | null; presetNote?: string; brain?: ProviderId;
  };
  if (!idea?.trim()) return NextResponse.json({ error: "Empty idea" }, { status: 400 });
  const ctx = contextBlock(project, presetNote);
  const system = [BRIEF_SYSTEM, ctx].filter(Boolean).join("\n\n");
  const prompt = `${mode === "image" ? "[This is an IMAGE request]\n" : ""}IDEA:\n${idea}`;
  const r = await runText(brain || defaultBrain(), system, prompt);
  if (r.error) return NextResponse.json({ error: `${r.provider}: ${r.error}` }, { status: 502 });
  return NextResponse.json({ brief: r.text, model: r.model });
}
