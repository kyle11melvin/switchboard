// Long model calls, sent as a stream.
//
// Two things can drop a slow or heavy reply before the browser gets it: phones give up on a request that
// stays silent for about a minute, and a single-piece reply has a size ceiling that a full-size image can hit.
// So the reply starts straight away, sends a space every few seconds while the model works, and ends with
// the JSON. Leading spaces are valid JSON, so the browser reads it as usual.
//
// The status is always 200 because it's sent before the outcome is known: failures arrive as { error }.

const BEAT_MS = 8000;

export function keepAlive(label: string, work: () => Promise<unknown>): Response {
  const enc = new TextEncoder();
  const t0 = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => { try { controller.enqueue(enc.encode(s)); } catch { /* browser went away */ } };
      send(" ");
      const beat = setInterval(() => send(" "), BEAT_MS);
      let out: unknown;
      try { out = await work(); } catch (e: any) { out = { error: e?.message ?? "Something went wrong. Try again." }; }
      clearInterval(beat);
      const body = JSON.stringify(out ?? { error: "Came back empty. Try again." });
      const failed = typeof (out as any)?.error === "string";
      console.log(`[switchboard] ${label} ${failed ? "failed" : "ok"} in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${(body.length / 1024).toFixed(0)} KB${failed ? `: ${(out as any).error}` : ""}`);
      send(body);
      try { controller.close(); } catch { /* already closed */ }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" },
  });
}
