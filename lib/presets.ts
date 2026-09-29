import type { ProviderId, Mode } from "./providers";

export interface Preset {
  id: string;
  label: string;
  mode: Mode;
  models: ProviderId[];
  judge: boolean;
  note?: string; // extra instruction sent to every model for this task type
}

// Edit freely — these are your routing defaults. Tap a preset, then toggle any model on/off.
// Each preset's icon is drawn in app/page.tsx (PRESET_ICONS), matched by id. A new id shows no icon until you add one.
export const PRESETS: Preset[] = [
  {
    id: "image",
    label: "Creative image",
    mode: "image",
    models: ["openai", "xai"],
    judge: false,
  },
  {
    id: "copy",
    label: "Copy & marketing",
    mode: "text",
    models: ["openai", "anthropic", "xai"],
    judge: true,
    note: "TASK TYPE: marketing/creative copy. Give 2-3 distinct options, not one. Plain, confident, human voice — no clichés, no hype words.",
  },
  {
    id: "build",
    label: "Code & build",
    mode: "text",
    models: ["anthropic", "openai"],
    judge: true,
    note: "TASK TYPE: software build/review. Be concrete: exact files, functions, and code. Never invent APIs, library functions, or file contents you haven't been shown — say what you'd need to see instead.",
  },
  {
    id: "research",
    label: "Research",
    mode: "text",
    models: ["perplexity", "anthropic", "gemini"],
    judge: true,
    note: "TASK TYPE: research. Cite sources for every factual claim that could have changed recently. Separate what is verified from what is inferred.",
  },
  {
    id: "mortgage",
    label: "Loan scenario",
    mode: "text",
    models: ["anthropic", "openai", "perplexity"],
    judge: true,
    note: "TASK TYPE: mortgage loan scenario, answered from a loan officer's perspective. Cite the specific guideline section for each rule you rely on: HUD Handbook 4000.1 (FHA), Fannie Mae Selling Guide, VA Pamphlet 26-7 chapters, and applicable Non-QM investor guidelines (DSCR, bank statement, ITIN, etc.). Lay out Conventional, FHA, VA and Non-QM options side by side where relevant. If you are not sure of a section number, say so — do not invent one.",
  },
  {
    id: "all",
    label: "Gut check (all)",
    mode: "text",
    models: ["openai", "anthropic", "xai", "perplexity", "gemini"],
    judge: true,
  },
];
