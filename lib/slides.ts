// Carousel slides: reading them out of written copy, and the looks they can be set in.
// Used by the browser (to split and edit) and by the server (to draw).

export type SlideKind = "cover" | "point" | "cta";
export interface Slide { kind: SlideKind; headline: string; body: string }
export interface Identity { name: string; company: string; nmls: string; phone: string }
export interface Carousel { slides: Slide[]; caption: string }

export const SLIDE_W = 1080;
export const SLIDE_H = 1350; // 4:5, Instagram's tallest feed size
export const MAX_SLIDES = 10; // Instagram's carousel limit when this was written; more are dropped

export interface Theme { id: string; label: string; bg: string; glow: string; text: string; muted: string; accent: string; accentInk: string; line: string }
export const THEMES: Theme[] = [
  { id: "harbor", label: "Harbor", bg: "#0a1517", glow: "#1c3a42", text: "#ecf3f4", muted: "#97adb3", accent: "#f0aa80", accentInk: "#1f0f05", line: "#2e4f59" },
  { id: "navy", label: "Navy & gold", bg: "#0e1830", glow: "#1d2c4d", text: "#f2f4f8", muted: "#9aa7bf", accent: "#e0bd6e", accentInk: "#1c1505", line: "#33405c" },
  { id: "paper", label: "Light", bg: "#f4f6f9", glow: "#ffffff", text: "#14203a", muted: "#56627a", accent: "#a8552b", accentInk: "#ffffff", line: "#c9d0dc" },
];
export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];

const clean = (s: string) => s.replace(/\*\*|__|`/g, "").replace(/^[\s>*\-–—•]+/, "").replace(/\s+/g, " ").trim();

// "[Name]" and friends become the person's real details; untouched when a detail is blank.
export function fillIn(text: string, who: Identity): string {
  const map: [RegExp, string][] = [
    [/\[\s*(your\s+)?name\s*\]/gi, who.name],
    [/\[\s*(your\s+)?company(\s+name)?\s*\]/gi, who.company],
    [/\[\s*(your\s+)?phone(\s+number)?\s*\]/gi, who.phone],
    [/(NMLS\s*#?\s*)?\[\s*NMLS\s*#?\s*\]/gi, who.nmls ? `NMLS #${who.nmls.replace(/^#/, "")}` : ""],
  ];
  return map.reduce((t, [re, v]) => (v ? t.replace(re, v) : t), text);
}

// Split one slide's text into a headline and the rest.
// "Visibility. Ask me where the loan stands…" -> headline "Visibility." + body.
function headAndBody(text: string, kind: SlideKind): { headline: string; body: string } {
  const t = clean(text);
  if (kind === "cover") return { headline: t, body: "" };
  const bold = /^\*\*(.+?)\*\*[\s:.—–-]*(.*)$/s.exec(text.trim());
  if (bold && bold[1].length <= 90) return { headline: clean(bold[1]), body: clean(bold[2]) };
  const m = /^(.{3,80}?[.!?:])\s+(.+)$/s.exec(t);
  if (m && m[2].length > 12) return { headline: m[1].replace(/:$/, ""), body: m[2] };
  return { headline: t, body: "" };
}

// Reads copy written as "Slide 1 (Cover): …", "Slide 2: …", "Caption: …".
export function readSlides(copy: string): Carousel {
  const lines = copy.replace(/\r/g, "").split("\n");
  const start = /^[\s>*#\-–•]*(?:\*\*)?\s*slide\s*(\d+)\s*(?:\(([^)]*)\))?\s*(?:\*\*)?\s*[:.\-–—]\s*(?:\*\*)?\s*(.*)$/i;
  const capStart = /^[\s>*#\-–•]*(?:\*\*)?\s*caption\s*(?:\*\*)?\s*[:.\-–—]\s*(?:\*\*)?\s*(.*)$/i;
  const stop = /^\s*(#{1,6}\s|---+\s*$|option\s*\d|angle\s*:|hashtags?\s*:|before posting)/i;
  const found: { label: string; text: string }[] = [];
  let caption = "";
  let into: "slide" | "caption" | null = null;
  for (const raw of lines) {
    const s = start.exec(raw);
    const c = capStart.exec(raw);
    if (s) { found.push({ label: (s[2] ?? "").toLowerCase(), text: s[3] }); into = "slide"; continue; }
    if (c) { caption = c[1]; into = "caption"; continue; }
    if (stop.test(raw)) { into = null; continue; }
    if (!raw.trim()) { if (into === "caption" && caption) into = null; continue; }
    if (into === "slide") found[found.length - 1].text += " " + raw.trim();
    else if (into === "caption") caption += " " + raw.trim();
  }
  const slides = found.slice(0, MAX_SLIDES).map((f, i, all): Slide => {
    const kind: SlideKind = /cover|hook|title/.test(f.label) || (i === 0 && !f.label) ? "cover"
      : /cta|call to action|close|closing|final/.test(f.label) || (i === all.length - 1 && all.length > 2 && /\b(dm|call|text|message|let'?s talk|reach out|contact)\b/i.test(f.text)) ? "cta"
      : "point";
    // The closing slide's name, company and NMLS line is drawn in the footer of every slide, so drop the copy of it.
    const t = kind === "cta" ? f.text.replace(/[\s|·,–—-]*(\[\s*(your\s+)?(name|company(\s+name)?)\s*\]|(NMLS\s*#?\s*)?\[\s*NMLS\s*#?\s*\])/gi, "").replace(/\s+([.,])/g, "$1").trim() : f.text;
    return { kind, ...headAndBody(t, kind) };
  });
  return { slides, caption: clean(caption) };
}
