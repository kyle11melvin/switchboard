import { NextResponse } from "next/server";
import { runText, defaultBrain, type ProviderId } from "@/lib/providers";
import { keepAlive } from "@/lib/stream";
import { blind, shortName, unblind } from "@/lib/blind";
import { measure, measuredSection } from "@/lib/measure";
import { GRADE_SYSTEM, WRITE_SYSTEM, judgeUserPrompt, writeUserPrompt, contextBlock, type ProjectCtx } from "@/lib/prompts";

export const maxDuration = 300; // two model calls, one after the other

function section(v: string, title: string) {
  const m = new RegExp(`(^|\\n)##\\s*${title}\\s*\\n`, "i").exec(v);
  if (!m) return { text: "", without: v };
  const start = m.index + m[0].length;
  const next = v.slice(start).search(/\n##\s/);
  const end = next < 0 ? v.length : start + next;
  return { text: v.slice(start, end).trim(), without: (v.slice(0, m.index) + v.slice(end)).trim() };
}

export async function POST(req: Request) {
  const { brief, answers, project, judge } = ((await req.json().catch(() => ({}))) ?? {}) as {
    brief: string; answers: { label: string; text: string; citations?: string[] }[];
    project?: ProjectCtx | null; judge?: ProviderId;
  };
  if (!answers?.length) return NextResponse.json({ error: "Nothing to judge" }, { status: 400 });
  const usable = answers.filter((a) => typeof a?.text === "string" && typeof a?.label === "string");
  // The judge sees "Answer A, B, C" in shuffled order; the names go back on before the verdict is returned.
  const { blinded, names } = blind(usable);
  if (!blinded.length) return NextResponse.json({ error: "Nothing to judge" }, { status: 400 });
  const who = judge || defaultBrain();
  const context = contextBlock(project);

  return keepAlive(`judge ${who}`, async () => {
    // Step 1: grade, and list the best parts of each answer.
    const graded = await runText(who, [GRADE_SYSTEM, context].filter(Boolean).join("\n\n"), judgeUserPrompt(brief, blinded));
    if (graded.error) return { error: `${graded.provider}: ${graded.error}` };
    const parts = section(graded.text ?? "", "Best parts");
    if (!parts.text) return { error: "The judge didn't list the best parts, so there was nothing to write from. Try again." };
    const flags = section(graded.text ?? "", "Red flags").text;

    // Step 2: write the final answer from that list alone.
    const written = await runText(who, [WRITE_SYSTEM, context].filter(Boolean).join("\n\n"), writeUserPrompt(brief, parts.text, flags));
    if (written.error) return { error: `${written.provider}: ${written.error}` };
    const best = section(written.text ?? "", "Best combined answer").text || (written.text ?? "").trim();
    const built = section(written.text ?? "", "Built from").text;
    if (!best) return { error: "The final answer came back empty. Try again." };

    // Count, in code, how much of the final wording came from each answer.
    const measured = measuredSection(measure(best, usable.map((a) => ({ name: shortName(a.label), text: a.text }))));

    const verdict = [
      unblind(parts.without, names),
      `## Best combined answer\n${best}`,
      built ? `## Built from\n${unblind(built, names)}` : "",
      measured,
      `## Best parts\n${unblind(parts.text, names)}`,
    ].filter(Boolean).join("\n\n");
    return { verdict, model: written.model, provider: written.provider };
  });
}
