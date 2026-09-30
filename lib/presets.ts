import type { ProviderId, Mode } from "./providers";

export interface Preset {
  id: string;
  label: string;
  mode: Mode;
  models: ProviderId[];
  judge: boolean;
  use: string;   // when this is the right kind of job; read by the AI that picks the job and the AIs on Send
  note?: string; // extra instruction sent to every model for this task type
}

// Edit freely — these are your routing defaults. On Send, an AI reads the question, picks one of these by its `use`
// and chooses the AIs (starting from `models`). Tapping a preset or an AI by hand overrides that.
// Each preset's icon is drawn in app/page.tsx (PRESET_ICONS), matched by id. A new id shows no icon until you add one.
export const PRESETS: Preset[] = [
  {
    id: "image",
    label: "Creative image",
    mode: "image",
    models: ["openai", "xai"],
    judge: false,
    use: "A picture to be made: a drawing, photo, logo, poster, thumbnail, mockup image, or a photo of people or pets turned into a scene. Not a web page or app screen to be built in code.",
  },
  {
    id: "copy",
    label: "Copy & marketing",
    mode: "text",
    models: ["openai", "anthropic", "xai"],
    judge: true,
    use: "Words for people to read: social posts, captions, emails, ads, scripts, bios, headlines, flyers' wording, rewrites.",
    note: "TASK TYPE: marketing/creative copy. Give 2-3 distinct options, not one. Plain, confident, human voice — no clichés, no hype words.",
  },
  {
    id: "build",
    label: "Code & build",
    mode: "text",
    models: ["anthropic", "openai"],
    judge: true,
    use: "Software: websites, apps, landing pages, UI screens, code, bugs, databases, automations, spreadsheets with formulas.",
    note: "TASK TYPE: software build/review. Be concrete: exact files, functions, and code. Never invent APIs, library functions, or file contents you haven't been shown — say what you'd need to see instead.",
  },
  {
    id: "research",
    label: "Research",
    mode: "text",
    models: ["perplexity", "anthropic", "gemini"],
    judge: true,
    use: "Finding out or comparing facts that may have changed: prices, products, news, statistics, what is best, how something works.",
    note: "TASK TYPE: research. Cite sources for every factual claim that could have changed recently. Separate what is verified from what is inferred.",
  },
  {
    id: "mortgage",
    label: "Loan scenario",
    mode: "text",
    models: ["anthropic", "openai", "perplexity"],
    judge: true,
    use: "A mortgage or loan question: a borrower's scenario, guidelines, programs (Conventional, FHA, VA, Non-QM), qualifying, rates, closing.",
    note: "TASK TYPE: mortgage loan scenario, answered from a loan officer's perspective. Cite the specific guideline section for each rule you rely on: HUD Handbook 4000.1 (FHA), Fannie Mae Selling Guide, VA Pamphlet 26-7 chapters, and applicable Non-QM investor guidelines (DSCR, bank statement, ITIN, etc.). Lay out Conventional, FHA, VA and Non-QM options side by side where relevant. If you are not sure of a section number, say so — do not invent one.",
  },
  {
    id: "all",
    label: "Ask everyone",
    mode: "text",
    models: ["openai", "anthropic", "xai", "perplexity", "gemini"],
    judge: true,
    use: "Only when the person asks for every AI, or for a big decision where more opinions clearly help.",
  },
];
