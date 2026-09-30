import { NextResponse } from "next/server";
import { runText, defaultBrain, providerStatus, type ProviderId } from "@/lib/providers";
import { keepAlive } from "@/lib/stream";
import { ROUTE_SYSTEM, routePrompt } from "@/lib/prompts";
import { PRESETS } from "@/lib/presets";

export const maxDuration = 60;

// Reads the question and picks the kind of job and which AIs answer it. The reply is checked against
// what exists, so a made-up job or an AI without a key never gets through.
export async function POST(req: Request) {
  const { idea, brain, photos } = ((await req.json().catch(() => ({}))) ?? {}) as { idea?: string; brain?: ProviderId; photos?: number };
  if (!idea?.trim()) return NextResponse.json({ error: "Empty idea" }, { status: 400 });
  const ais = providerStatus().filter((p) => p.configured);
  if (!ais.length) return NextResponse.json({ error: "No AIs are set up." }, { status: 400 });
  const jobs = PRESETS.map((p) => ({ id: p.id, label: p.label, use: p.use, models: p.models }));
  const who = brain || defaultBrain();
  return keepAlive(`pick ${who}`, async () => {
    const r = await runText(who, ROUTE_SYSTEM, routePrompt(idea, jobs, ais, Number(photos) || 0));
    if (r.error) return { error: `${r.provider}: ${r.error}` };
    const m = /\{[\s\S]*\}/.exec(r.text ?? "");
    let d: any = null;
    try { d = m ? JSON.parse(m[0]) : null; } catch { /* handled below */ }
    const job = PRESETS.find((p) => p.id === d?.job);
    if (!job) return { error: "didn't name a job" };
    const ok = new Set(ais.map((a) => a.id));
    const drawers = new Set(ais.filter((a) => a.canImage).map((a) => a.id));
    let picked = (Array.isArray(d.ais) ? d.ais : []).filter((x: unknown): x is ProviderId => typeof x === "string" && ok.has(x as ProviderId));
    if (job.mode === "image" && picked.some((x: ProviderId) => drawers.has(x))) picked = picked.filter((x: ProviderId) => drawers.has(x));
    if (!picked.length) picked = job.models.filter((x) => ok.has(x));
    return { job: job.id, ais: [...new Set(picked)], why: typeof d.why === "string" ? d.why.slice(0, 120) : "" };
  });
}
