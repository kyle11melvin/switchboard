// Slow answers finish on the server, not inside the phone's open connection.
//
// A phone closes a web app's connections the moment you switch away, and a research answer from a big
// model can take two minutes. So /api/run and /api/judge hand back a job id straight away, keep working
// after the reply has gone out, and park the result in the sync store. The browser asks for it with
// short requests that survive leaving and coming back, and even reopening the app.
//
// Without the sync store there is nowhere shared to park results, so those routes answer inline as before.
// JOBS_MEMORY=1 parks them in this process instead (local runs and tests).

import { after } from "next/server";
import { command, storeConnected } from "./store";

const KEEP_S = 60 * 60; // an unread result is dropped after an hour

interface Job { status: "running" | "done"; at: number; result?: unknown }

const mem = new Map<string, Job>();
export const jobsOn = () => storeConnected() || process.env.JOBS_MEMORY === "1";
const key = (id: string) => `job:${id}`;

async function put(id: string, job: Job) {
  if (storeConnected()) await command(["SET", key(id), JSON.stringify(job), "EX", KEEP_S]);
  else { mem.set(id, job); setTimeout(() => mem.delete(id), KEEP_S * 1000).unref?.(); }
}
async function get(id: string): Promise<Job | null> {
  if (!storeConnected()) return mem.get(id) ?? null;
  const raw = await command(["GET", key(id)]);
  try { return typeof raw === "string" ? (JSON.parse(raw) as Job) : null; } catch { return null; }
}

// Starts the work and returns its id at once. The work runs on after the response is sent.
export async function startJob(label: string, work: () => Promise<unknown>): Promise<string> {
  const id = crypto.randomUUID();
  await put(id, { status: "running", at: Date.now() });
  const t0 = Date.now();
  after(async () => {
    let out: unknown;
    try { out = await work(); } catch (e: any) { out = { error: e?.message ?? "Something went wrong. Try again." }; }
    const result = out ?? { error: "Came back empty. Try again." };
    const failed = typeof (result as any)?.error === "string";
    console.log(`[switchboard] ${label} ${failed ? "failed" : "ok"} in ${((Date.now() - t0) / 1000).toFixed(1)}s${failed ? `: ${(result as any).error}` : ""}`);
    try { await put(id, { status: "done", at: Date.now(), result }); }
    catch (e: any) { console.log(`[switchboard] ${label}: couldn't store the result: ${e?.message}`); }
  });
  return id;
}

// null: no such job (never existed, or its hour is up).
export async function readJob(id: string): Promise<{ pending: true } | { pending: false; result: unknown } | null> {
  if (!/^[\w-]{8,64}$/.test(id)) return null;
  const job = await get(id);
  if (!job) return null;
  return job.status === "done" ? { pending: false, result: job.result } : { pending: true };
}
