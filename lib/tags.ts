// Turn the judge's grading (markdown) into one tag per answer, for the "what was challenged" view.
//
// The grade has a Scorecard table ("| Answer B | 8/10 | reason |") and a Red flags list that quotes the
// text it objects to and names the answer. An answer with a red flag is a potential weakness; a clean
// answer scoring 8 or more is a strong recommendation; anything else was simply used.

export type TagKind = "strong" | "weak" | "used" | "unused";
export interface AnswerTag { letter: string; tag: TagKind; score?: number; reason?: string }

export const TAG_LABEL: Record<TagKind, string> = {
  strong: "Strong recommendation",
  weak: "Potential weakness",
  used: "Used",
  unused: "Not used",
};

function sectionText(md: string, title: string): string {
  const m = new RegExp(`(^|\\n)##\\s*${title}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i").exec(md);
  return m ? m[2].trim() : "";
}

export function tagAnswers(grade: string, letters: string[]): AnswerTag[] {
  const scores: Record<string, number> = {};
  for (const m of grade.matchAll(/\|\s*\**Answer\s+([A-H])\**\s*\|\s*\**(\d+(?:\.\d+)?)\s*\/\s*10/gi)) scores[m[1].toUpperCase()] = Number(m[2]);
  const flags = sectionText(grade, "Red flags");
  const notUsed = sectionText(grade, "Not used") || (sectionText(grade, "Best parts").match(/###\s*Not used\s*\n([\s\S]*)$/i)?.[1] ?? "");
  return letters.map((letter) => {
    const L = letter.toUpperCase();
    // A red-flag bullet that names this answer; keep its quoted receipt as the reason.
    const line = flags.split("\n").find((l) => new RegExp(`\\bAnswer\\s+${L}\\b`).test(l));
    if (line && !/none found/i.test(flags)) {
      const quote = /["“]([^"”]{8,200})["”]/.exec(line)?.[1];
      const why = line.split(/\s[—–-]\s/).pop()?.trim();
      return { letter: L, tag: "weak", score: scores[L], reason: [quote ? `"${quote}"` : "", why && why !== line ? why : ""].filter(Boolean).join(" ") || line.replace(/^\s*[-*>]\s*/, "").slice(0, 200) };
    }
    if (new RegExp(`\\bAnswer\\s+${L}\\b`).test(notUsed)) return { letter: L, tag: "unused", score: scores[L] };
    if ((scores[L] ?? 0) >= 8) return { letter: L, tag: "strong", score: scores[L] };
    return { letter: L, tag: "used", score: scores[L] };
  });
}
