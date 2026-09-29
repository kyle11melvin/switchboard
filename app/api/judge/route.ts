import { NextResponse } from "next/server";
import { runText, defaultBrain, type ProviderId } from "@/lib/providers";
import { keepAlive } from "@/lib/stream";
import { JUDGE_SYSTEM, judgeUserPrompt, contextBlock, type ProjectCtx } from "@/lib/prompts";

export const maxDuration = 120;

export async function POST(req: Request) {
  const { brief, answers, project, judge } = (await req.json()) as {
    brief: string; answers: { label: string; text: string; citations?: string[] }[];
    project?: ProjectCtx | null; judge?: ProviderId;
  };
  if (!answers?.length) return NextResponse.json({ error: "Nothing to judge" }, { status: 400 });
  const system = [JUDGE_SYSTEM, contextBlock(project)].filter(Boolean).join("\n\n");
  return keepAlive(`judge ${judge || defaultBrain()}`, async () => {
    const r = await runText(judge || defaultBrain(), system, judgeUserPrompt(brief, answers));
    if (r.error) return { error: `${r.provider}: ${r.error}` };
    return { verdict: r.text, model: r.model, provider: r.provider };
  });
}
