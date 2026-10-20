import { NextResponse } from "next/server";
import { ask, type AskEvent } from "@/lib/pipeline";
import { isTier, tierDef } from "@/lib/tiers";
import { release, reserve } from "@/lib/usage";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// The app's one call: a question in, progress out as newline-delimited JSON, ending with the top answer
// and the cost. The gate in middleware.ts has already checked the bearer token.
export async function POST(req: Request) {
  const body = ((await req.json().catch(() => null)) ?? {}) as { question?: unknown; tier?: unknown };
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 4000) : "";
  if (!question) return NextResponse.json({ error: "Ask something first." }, { status: 400 });
  const tier = isTier(body.tier) ? body.tier : "standard";
  const who = (req.headers.get("x-device-id") || "anonymous").slice(0, 80);

  const usage = await reserve(who, tierDef(tier).cap);
  if (usage.capped) return NextResponse.json({ error: `You have used all ${usage.cap} questions this month on the ${tierDef(tier).label} plan.`, usage }, { status: 402 });

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AskEvent | { type: "usage"; usage: typeof usage }) => { try { controller.enqueue(enc.encode(JSON.stringify(e) + "\n")); } catch { /* the phone went away */ } };
      send({ type: "usage", usage });
      const beat = setInterval(() => { try { controller.enqueue(enc.encode("\n")); } catch { /* closed */ } }, 8000);
      let answered = false;
      try {
        const r = await ask({ question, tier, onEvent: (e) => { if (e.type === "answer") answered = true; send(e); } });
        if (!r.ok && !answered) await release(who);
        console.log(`[switchboard] ask ${tier} ${r.ok ? "ok" : "failed"} $${r.cost.usd} over ${r.cost.calls} calls`);
      } catch (e: any) {
        send({ type: "error", stage: "unexpected", message: e?.message ?? "Something went wrong. Try again." });
        if (!answered) await release(who);
      }
      clearInterval(beat);
      try { controller.close(); } catch { /* already closed */ }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" },
  });
}
