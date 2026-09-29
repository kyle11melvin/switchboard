// An independent check on the judge.
//
// The judge says what it took from each answer. This counts it instead: how much of the final
// answer's wording can be found in each original answer. It is done in code, so it can't flatter anyone.
// It measures wording, not ideas: a borrowed idea that was reworded counts as new wording.

const PHRASE = 4; // words per phrase

export const wordsOf = (t: string) =>
  (t || "").toLowerCase().replace(/[`*_#>|]/g, " ").replace(/[^a-z0-9%$.' -]+/g, " ").split(/\s+/).filter(Boolean);

function phrases(t: string): Set<string> {
  const w = wordsOf(t);
  const out = new Set<string>();
  for (let i = 0; i + PHRASE <= w.length; i++) out.add(w.slice(i, i + PHRASE).join(" "));
  return out;
}

export interface Measured { shares: { name: string; percent: number }[]; fresh: number; words: number }

export function measure(finalAnswer: string, sources: { name: string; text: string }[]): Measured | null {
  const mine = [...phrases(finalAnswer)];
  if (mine.length < 8) return null; // too short for the numbers to mean anything
  const sets = sources.map((s) => ({ name: s.name, set: phrases(s.text) }));
  const shares = sets.map((s) => ({ name: s.name, percent: Math.round((mine.filter((p) => s.set.has(p)).length / mine.length) * 100) }));
  const fresh = Math.round((mine.filter((p) => !sets.some((s) => s.set.has(p))).length / mine.length) * 100);
  return { shares: shares.sort((a, b) => b.percent - a.percent), fresh, words: wordsOf(finalAnswer).length };
}

export function measuredSection(m: Measured | null): string {
  if (!m) return "";
  const rows = m.shares.map((s) => `| ${s.name} | ${s.percent}% |`).join("\n");
  return `## Measured\nShare of the final answer's wording found in each answer, counted by Switchboard, not by the judge. Reworded ideas count as new.\n\n| Source | Wording |\n|---|---|\n${rows}\n| New wording | ${m.fresh}% |`;
}
