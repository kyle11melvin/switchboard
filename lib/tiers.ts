// The two plans, and which model answers in each.
//
// A question is one "brain" (picks the AIs, sharpens the question, grades the answers, writes the top one)
// plus two or three answerers chosen for the kind of job. The standard plan runs on fast models, the
// premium plan on the strongest. Override the whole table with TIERS_JSON in the environment when a
// model id changes; the shape is the same as TIERS below.

import type { ProviderId } from "./providers";

export type Tier = "standard" | "premium";
export type JobId = "writing" | "code" | "research" | "general";

export interface Slot { provider: ProviderId; model: string }
export interface TierDef {
  label: string;
  cap: number;                       // questions a month
  brain: Slot;
  answerers: Record<JobId, Slot[]>;
}

const sonnet: Slot = { provider: "anthropic", model: "claude-sonnet-5-5" };
const opus: Slot = { provider: "anthropic", model: "claude-opus-5-5" };
const gptMini: Slot = { provider: "openai", model: "gpt-5-mini" };
const gpt: Slot = { provider: "openai", model: "gpt-5" };
const flash: Slot = { provider: "gemini", model: "gemini-3.5-flash" };
const sonar: Slot = { provider: "perplexity", model: "perplexity/sonar" };

const TIERS: Record<Tier, TierDef> = {
  standard: {
    label: "Standard",
    cap: 60,
    brain: sonnet,
    answerers: {
      writing: [sonnet, gptMini, flash],
      code: [sonnet, gptMini],
      research: [sonar, sonnet, flash],
      general: [sonnet, gptMini, flash],
    },
  },
  premium: {
    label: "Premium",
    cap: 100,
    brain: opus,
    answerers: {
      writing: [opus, gpt, flash],
      code: [opus, gpt],
      research: [sonar, opus, flash],
      general: [opus, gpt, flash],
    },
  },
};

export function tierDef(t: Tier): TierDef {
  try {
    const o = JSON.parse(process.env.TIERS_JSON || "null");
    if (o && o[t] && o[t].brain && o[t].answerers) return o[t] as TierDef;
  } catch { /* ignore a bad override */ }
  return TIERS[t];
}

export const isTier = (x: unknown): x is Tier => x === "standard" || x === "premium";
