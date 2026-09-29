import { NextResponse } from "next/server";
import { runText, defaultBrain, type ProviderId } from "@/lib/providers";
import { keepAlive } from "@/lib/stream";
import { blind, unblind } from "@/lib/blind";
import { JUDGE_SYSTEM, judgeUserPrompt, contextBlock, type ProjectCtx } from "@/lib/prompts";

export const maxDuration = 120;

export async function POST(req: Request) {
  const { brief, answers, project, judge } = (await req.json()) as {
    brief: string; answers: { label: string; text: string; citations?: string[] }[];
    project?: ProjectCtx | null; judge?: ProviderId;
  };
  if (!answers?.length) return NextResponse.json({ error: "Nothing to judge" }, { status: 400 });
  const system = [JUDGE_SYSTEM, contextBlock(project)].filter(Boolean).join("\n\n");
  // The judge sees "Answer A, B, C" in shuffled order; the names go back on before the verdict is returned.
  const { blinded, names } = blind(answers.filter((a) => typeof a?.text === "string" && typeof a?.label === "string"));
  if (!blinded.length) return NextResponse.json({ error: "Nothing to judge" }, { status: 400 });
  return keepAlive(`judge ${judge || defaultBrain()}`, async () => {
    const r = await runText(judge || defaultBrain(), system, judgeUserPrompt(brief, blinded));
    if (r.error) return { error: `${r.provider}: ${r.error}` };
    return { verdict: unblind(r.text ?? "", names), model: r.model, provider: r.provider };
  });
}
