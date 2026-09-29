import { NextResponse } from "next/server";
import { runText, defaultBrain, type ProviderId } from "@/lib/providers";
import { JUDGE_SYSTEM, judgeUserPrompt, contextBlock, type ProjectCtx } from "@/lib/prompts";

export const maxDuration = 120;

export async function POST(req: Request) {
  const { brief, answers, project, judge } = (await req.json()) as {
    brief: string; answers: { label: string; text: string; citations?: string[] }[];
    project?: ProjectCtx | null; judge?: ProviderId;
  };
  if (!answers?.length) return NextResponse.json({ error: "Nothing to judge" }, { status: 400 });
  const system = [JUDGE_SYSTEM, contextBlock(project)].filter(Boolean).join("\n\n");
  const r = await runText(judge || defaultBrain(), system, judgeUserPrompt(brief, answers));
  if (r.error) return NextResponse.json({ error: `${r.provider}: ${r.error}` }, { status: 502 });
  return NextResponse.json({ verdict: r.text, model: r.model, provider: r.provider });
}
