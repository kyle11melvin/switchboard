// One question, start to finish: pick the AIs, sharpen, ask them all, challenge, combine.
//
// This is the whole product in one function. It reports progress through onEvent as each step lands,
// so the app can show the routing, the answers arriving, the challenge and the top answer in turn, and
// it keeps a running cost. The web tool's routes (brief, run, judge) do the same steps separately.

import { runText, providerStatus, type ProviderId, type RunResult } from "./providers";
import { ROUTE_SYSTEM, routePrompt, BRIEF_SYSTEM, answerSystem, gradeSystem, writeSystem, judgeUserPrompt, writeUserPrompt, contextBlock } from "./prompts";
import { blind, unblind } from "./blind";
import { measure } from "./measure";
import { JOBS, jobById, guessJob } from "./jobs";
import { tierDef, type Tier, type JobId, type Slot } from "./tiers";
import { tagAnswers, TAG_LABEL, type TagKind } from "./tags";
import { Tally } from "./cost";

export type AskEvent =
  | { type: "picked"; job: JobId; jobLabel: string; why: string; ais: { provider: ProviderId; model: string }[] }
  | { type: "sharpened"; brief: string; asWritten: boolean }
  | { type: "answer"; provider: ProviderId; model: string; status: "done" | "failed"; text?: string; error?: string; citations?: string[]; ms: number }
  | { type: "challenged"; tags: { provider: ProviderId; tag: TagKind; label: string; score?: number; reason?: string }[]; agree: string; split: string; flags: number }
  | { type: "answered"; best: string; builtFrom: string; measured: { name: string; percent: number }[]; fresh: number; checked: ProviderId[]; model: string; provider: ProviderId }
  | { type: "done"; cost: { usd: number; calls: number; input: number; output: number; unpriced: string[] }; ms: number }
  | { type: "error"; stage: string; message: string };

export interface AskInput { question: string; tier: Tier; onEvent: (e: AskEvent) => void }

function section(md: string, title: string): string {
  const m = new RegExp(`(^|\\n)##\\s*${title}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i").exec(md);
  return m ? m[2].trim() : "";
}

export async function ask({ question, tier, onEvent }: AskInput): Promise<{ ok: boolean; cost: ReturnType<Tally["summary"]> }> {
  const t0 = Date.now();
  const def = tierDef(tier);
  const tally = new Tally();
  const configured = new Set(providerStatus().filter((p) => p.configured).map((p) => p.id));
  const brain = def.brain;
  if (!configured.has(brain.provider)) {
    onEvent({ type: "error", stage: "setup", message: `${brain.provider} has no API key, and it is the brain for the ${def.label} plan.` });
    return { ok: false, cost: tally.summary() };
  }
  const call = async (slot: Slot, system: string, prompt: string): Promise<RunResult> => {
    const r = await runText(slot.provider, system, prompt, [], { model: slot.model });
    tally.add(r.model, r.usage);
    return r;
  };

  // 1. Pick the kind of job, and which AIs should answer it.
  let job = jobById(guessJob(question))!;
  let why = "";
  let slots: Slot[] = [];
  {
    const ais = [...configured].map((id) => ({ id, label: id, canImage: false }));
    const jobs = JOBS.map((j) => ({ id: j.id, label: j.label, use: j.use, models: def.answerers[j.id].map((s) => s.provider) }));
    const r = await call(brain, ROUTE_SYSTEM, routePrompt(question, jobs, ais, 0));
    const m = /\{[\s\S]*\}/.exec(r.text ?? "");
    let d: any = null;
    try { d = m ? JSON.parse(m[0]) : null; } catch { /* fall back below */ }
    const picked = jobById(d?.job);
    if (picked) { job = picked; why = typeof d.why === "string" ? d.why.slice(0, 120) : ""; }
    const wanted = new Set((Array.isArray(d?.ais) ? d.ais : []).filter((x: unknown) => typeof x === "string"));
    const usual = def.answerers[job.id].filter((s) => configured.has(s.provider));
    const chosen = usual.filter((s) => wanted.has(s.provider));
    slots = chosen.length >= 2 ? chosen : usual;
  }
  if (slots.length === 0) {
    onEvent({ type: "error", stage: "pick", message: "None of the AIs for this kind of question has an API key." });
    return { ok: false, cost: tally.summary() };
  }
  onEvent({ type: "picked", job: job.id, jobLabel: job.label, why, ais: slots.map((s) => ({ provider: s.provider, model: s.model })) });

  // 2. Sharpen the question. If that fails, ask it as written.
  const note = contextBlock(null, job.note);
  let brief = question;
  let asWritten = true;
  {
    const r = await call(brain, [BRIEF_SYSTEM, note].filter(Boolean).join("\n\n"), `IDEA:\n${question}`);
    if (!r.error && r.text?.trim()) { brief = r.text.trim(); asWritten = false; }
  }
  onEvent({ type: "sharpened", brief, asWritten });

  // 3. Every chosen AI answers on its own, in parallel; each lands as it finishes.
  const system = [answerSystem(""), note].filter(Boolean).join("\n\n");
  const answers = await Promise.all(slots.map(async (s) => {
    const r = await call(s, system, brief);
    onEvent({ type: "answer", provider: s.provider, model: r.model, status: r.error ? "failed" : "done", text: r.text, error: r.error, citations: r.citations, ms: r.ms });
    return r;
  }));
  const usable = answers.filter((a) => a.text && !a.error);
  if (usable.length === 0) {
    onEvent({ type: "error", stage: "answers", message: "None of the AIs answered. Try again in a moment." });
    return { ok: false, cost: tally.summary() };
  }

  // 4. Challenge: the brain grades the answers blind, then writes one answer from the best parts.
  const checked = usable.map((a) => a.provider);
  if (usable.length === 1) {
    const only = usable[0];
    onEvent({ type: "challenged", tags: [{ provider: only.provider, tag: "used", label: "Only answer", reason: "The other AIs did not answer, so this one was not checked against anything." }], agree: "", split: "", flags: 0 });
    onEvent({ type: "answered", best: only.text!, builtFrom: "", measured: [], fresh: 0, checked, model: only.model, provider: only.provider });
    onEvent({ type: "done", cost: tally.summary(), ms: Date.now() - t0 });
    return { ok: true, cost: tally.summary() };
  }
  const labelOf = (p: ProviderId) => ({ openai: "ChatGPT", anthropic: "Claude", xai: "Grok", perplexity: "Perplexity", gemini: "Gemini" })[p];
  const { blinded, names } = blind(usable.map((a) => ({ label: labelOf(a.provider), text: a.text!, citations: a.citations })));
  const providerOfName: Record<string, ProviderId> = Object.fromEntries(usable.map((a) => [labelOf(a.provider), a.provider]));
  const graded = await call(brain, [gradeSystem(""), note].filter(Boolean).join("\n\n"), judgeUserPrompt(brief, blinded));
  if (graded.error || !graded.text) {
    onEvent({ type: "error", stage: "challenge", message: `The answers came back but could not be checked (${graded.error ?? "empty grading"}). Try again.` });
    return { ok: false, cost: tally.summary() };
  }
  const tags = tagAnswers(graded.text, blinded.map((b) => b.letter)).map((t) => ({
    provider: providerOfName[names[t.letter]], tag: t.tag, label: TAG_LABEL[t.tag], score: t.score, reason: t.reason ? unblind(t.reason, names) : undefined,
  }));
  onEvent({
    type: "challenged", tags,
    agree: unblind(section(graded.text, "Where they agree"), names),
    split: unblind(section(graded.text, "Where they split"), names),
    flags: tags.filter((t) => t.tag === "weak").length,
  });

  const parts = section(graded.text, "Best parts");
  const flags = section(graded.text, "Red flags");
  const written = await call(brain, [writeSystem(""), note].filter(Boolean).join("\n\n"), writeUserPrompt(brief, parts || graded.text, flags));
  if (written.error || !written.text) {
    onEvent({ type: "error", stage: "combine", message: `The top answer could not be written (${written.error ?? "empty"}). Try again.` });
    return { ok: false, cost: tally.summary() };
  }
  const best = section(written.text, "Best combined answer") || written.text.trim();
  const builtFrom = unblind(section(written.text, "Built from"), names);
  const m = measure(best, usable.map((a) => ({ name: labelOf(a.provider), text: a.text! })));
  onEvent({ type: "answered", best, builtFrom, measured: m?.shares ?? [], fresh: m?.fresh ?? 0, checked, model: written.model, provider: written.provider });
  onEvent({ type: "done", cost: tally.summary(), ms: Date.now() - t0 });
  return { ok: true, cost: tally.summary() };
}
