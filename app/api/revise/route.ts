import { NextResponse } from "next/server";
import { PROVIDERS, runText, defaultBrain, type ProviderId, type Shown } from "@/lib/providers";
import { keepAlive } from "@/lib/stream";
import { REVISE_SYSTEM, reviseUserPrompt, contextBlock, type ProjectCtx } from "@/lib/prompts";

export const maxDuration = 120;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

// Turns "here's what I'd change" into the next brief, or one short question back.
export async function POST(req: Request) {
  const b = ((await req.json().catch(() => null)) ?? {}) as any;
  const idea = str(b.idea, 20_000), brief = str(b.brief, 20_000);
  const chat = (Array.isArray(b.chat) ? b.chat : [])
    .map((m: any) => ({ role: m?.role === "you" ? ("you" as const) : ("them" as const), text: str(m?.text, 4000).trim() }))
    .filter((m: { text: string }) => m.text)
    .slice(-12);
  if (!chat.some((m: { role: string }) => m.role === "them")) return NextResponse.json({ error: "Say what you'd like changed first." }, { status: 400 });
  if (!idea.trim() && !brief.trim()) return NextResponse.json({ error: "There's no brief to revise yet." }, { status: 400 });

  const given = (Array.isArray(b.results) ? b.results : []).slice(0, 6);
  const shown: Shown[] = [];
  const results = given.map((r: any) => {
    const name = str(r?.name, 40) || "A model";
    const image = str(r?.image, 1_500_000);
    const hasImage = /^data:image\/(jpeg|png|webp);base64,/.test(image);
    if (hasImage) shown.push({ label: `Picture from ${name}:`, dataUrl: image });
    return { name, text: str(r?.text, 6000), error: str(r?.error, 300) || undefined, hasImage };
  });
  // Two questions at most, however the conversation goes.
  // The opening "What do you want changed?" isn't a follow-up, so it doesn't count.
  const firstAnswer = chat.findIndex((m: { role: string }) => m.role === "them");
  const asked = chat.slice(firstAnswer).filter((m: { role: string }) => m.role === "you").length;
  const who: ProviderId = PROVIDERS[b.brain as ProviderId] ? b.brain : defaultBrain();
  const system = [REVISE_SYSTEM, asked >= 2 ? "You have asked two questions already. Reply with BRIEF: now." : "", contextBlock(b.project as ProjectCtx | null)].filter(Boolean).join("\n\n");

  return keepAlive(`revise ${who}`, async () => {
    const r = await runText(who, system, reviseUserPrompt({ idea, brief: brief || idea, mode: b.mode === "image" ? "image" : "text", results, chat }), shown);
    if (r.error) return { error: `${r.provider}: ${r.error}` };
    const out = (r.text ?? "").trim();
    const q = /^\**\s*QUESTION\s*:\**\s*([\s\S]+)$/i.exec(out);
    if (q && asked < 2 && !/\bBRIEF\s*:/i.test(out)) return { question: q[1].trim().slice(0, 600) };
    const br = /\**\s*BRIEF\s*:\**\s*([\s\S]+)$/i.exec(out);
    const next = (br ? br[1] : out).trim();
    if (!next) return { error: "The new brief came back empty. Try again." };
    return { brief: next, sawPictures: shown.length };
  });
}
