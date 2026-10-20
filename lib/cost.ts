// What a model call costs, from published per-token rates.
//
// Rates are dollars per million tokens, matched by the longest prefix of the model id, so
// "claude-opus-5-5-20260401" still finds "claude-opus-5-5". Edit this table when prices change, or set
// COST_RATES_JSON in the environment to add or override entries without a code change:
//   COST_RATES_JSON={"gpt-5-mini":[0.25,2]}
// A model with no rate still runs; its calls are reported as unpriced so nobody mistakes zero for free.

export interface Usage { input: number; output: number }

const BUILT_IN: Record<string, [number, number]> = {
  // Anthropic (first-party rates)
  "claude-opus-5-5": [4, 20],
  "claude-opus-5": [5, 25],
  "claude-sonnet-5-5": [2, 10],
  "claude-sonnet-5": [2, 10],
  "claude-haiku-5-5": [0.10, 0.50],
  // OpenAI (published rates as tracked in October 2026; verify on the pricing page)
  "gpt-5.5": [5, 30],
  "gpt-5-mini": [0.25, 2],
  "gpt-5-nano": [0.05, 0.40],
  "gpt-5": [1.25, 10],
  // Google
  "gemini-3.5-flash-lite": [0.10, 0.40],
  "gemini-3.5-flash": [1.50, 9],
  "gemini-3.8-flash": [1.50, 9],
  // Perplexity Agent API
  "perplexity/sonar": [0.25, 2.50],
  // xAI
  "grok-4-fast": [0.20, 0.50],
  "grok-4": [3, 15],
};

function rates(): Record<string, [number, number]> {
  let extra: Record<string, [number, number]> = {};
  try { extra = JSON.parse(process.env.COST_RATES_JSON || "{}"); } catch { /* ignore a bad override */ }
  return { ...BUILT_IN, ...extra };
}

export function rateFor(model: string): [number, number] | null {
  const table = rates();
  const key = Object.keys(table).filter((k) => model.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  return key ? table[key] : null;
}

// Dollars for one call, or null when the model has no rate.
export function costOf(model: string, usage: Usage | undefined): number | null {
  const r = rateFor(model);
  if (!r || !usage) return null;
  return (usage.input * r[0] + usage.output * r[1]) / 1_000_000;
}

// Running total for one question.
export class Tally {
  usd = 0; input = 0; output = 0; calls = 0; unpriced: string[] = [];
  add(model: string, usage: Usage | undefined) {
    this.calls++;
    if (usage) { this.input += usage.input; this.output += usage.output; }
    const c = costOf(model, usage);
    if (c === null) { if (!this.unpriced.includes(model)) this.unpriced.push(model); }
    else this.usd += c;
  }
  summary() { return { usd: Math.round(this.usd * 10000) / 10000, calls: this.calls, input: this.input, output: this.output, unpriced: this.unpriced }; }
}
