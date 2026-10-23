// The kinds of question the app routes between. Read by the pick step (which chooses one by `use`) and
// sent to every answerer as `note`. Image jobs are not part of the app; see lib/presets.ts for the web tool.

import type { JobId } from "./tiers";

export interface Job { id: JobId; label: string; use: string; note?: string }

export const JOBS: Job[] = [
  {
    id: "research",
    label: "Research",
    use: "Finding out or comparing facts that may have changed: prices, products, news, statistics, what is best, how something works, anything that needs sources.",
    note: "TASK TYPE: research. Cite sources for every factual claim that could have changed recently. Separate what is verified from what is inferred.",
  },
  {
    id: "writing",
    label: "Writing",
    use: "Words for people to read: posts, captions, emails, ads, scripts, bios, headlines, rewrites, messages.",
    note: "TASK TYPE: writing. Plain, confident, human voice. No clichés, no hype words. Give one strong version, not a menu.",
  },
  {
    id: "code",
    label: "Code",
    use: "Software: websites, apps, code, bugs, formulas, automations, technical how-to.",
    note: "TASK TYPE: software. Be concrete: exact steps, files and code. Never invent APIs or library functions; say what you would need to see instead.",
  },
  {
    id: "general",
    label: "Everyday question",
    use: "Advice, explanations, decisions, planning, health, money, relationships, anything that is not clearly one of the others.",
    note: "TASK TYPE: everyday question. Answer the person directly, in plain words, with the reasoning that matters and nothing padded.",
  },
];

export const jobById = (id: unknown): Job | undefined => JOBS.find((j) => j.id === id);

// When the pick step fails, a cheap guess from the words.
export function guessJob(question: string): JobId {
  const q = question.toLowerCase();
  if (/\b(code|bug|app|website|function|api|sql|python|javascript|typescript|swift|formula|spreadsheet)\b/.test(q)) return "code";
  if (/\b(write|rewrite|draft|caption|post|email|headline|bio|script|tagline)\b/.test(q)) return "writing";
  if (/\b(best|compare|vs|versus|price|cost|latest|news|current|research|which|statistics)\b/.test(q)) return "research";
  return "general";
}
