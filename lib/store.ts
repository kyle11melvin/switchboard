// Where synced data lives: an Upstash Redis store, reached over its REST API with plain fetch
// (same approach as lib/providers.ts, no SDK). Vercel adds the two settings when the store is connected.
//
//   sb:projects      hash   project id -> project JSON (deleted projects stay as markers)
//   sb:runs          hash   run id -> run JSON
//   sb:runs:seq      zset   run id scored by a rising counter: "what changed since I last looked"
//   sb:runs:at       zset   run id scored by when it ran: trimming and clearing
//   sb:seq           the counter
//   sb:clearedAt     when history was last cleared

import { HISTORY_LIMIT, changedAt, isProject, isRun, type SyncedProject, type SyncedRun } from "./merge";

const url = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const token = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export const storeConnected = () => Boolean(url() && token());

// Every key starts with this. Tests set SYNC_PREFIX so they never touch real data.
const K = (name: string) => `${process.env.SYNC_PREFIX || "sb"}:${name}`;

type Cmd = (string | number)[];

async function send(path: string, body: unknown): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url().replace(/\/$/, "") + path, {
      method: "POST",
      headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new Error("Couldn't reach the sync storage.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || data === null) throw new Error(`Sync storage answered with an error (${res.status}).`);
  return data;
}

// One command, for the few other things kept in the same store (see lib/jobs.ts).
export const command = (cmd: Cmd) => run(cmd.map((c, i) => (i === 1 && typeof c === "string" ? K(c) : c)));

async function run(cmd: Cmd): Promise<any> {
  const d = await send("/", cmd);
  if (d.error) throw new Error(`Sync storage: ${d.error}`);
  return d.result;
}
async function runAll(cmds: Cmd[]): Promise<any[]> {
  if (!cmds.length) return [];
  const d = await send("/pipeline", cmds);
  // A command the storage doesn't know rejects the whole batch with a single error.
  if (!Array.isArray(d)) throw new Error(d?.error ? `Sync storage: ${d.error}` : "Sync storage gave an unexpected reply.");
  return d.map((x) => { if (x?.error) throw new Error(`Sync storage: ${x.error}`); return x?.result; });
}
const parse = <T,>(s: unknown): T | null => { try { return typeof s === "string" ? (JSON.parse(s) as T) : null; } catch { return null; } };

export const PAGE = 40;          // runs per page when a device catches up
const MAX_RUN_BYTES = 400_000;   // one run; keeps any single request well inside the storage's limits

export async function readChanges(since: number) {
  const [projects, cleared, ids] = await runAll([
    ["HVALS", K("projects")],
    ["GET", K("clearedAt")],
    ["ZRANGEBYSCORE", K("runs:seq"), `(${since}`, "+inf", "WITHSCORES", "LIMIT", 0, PAGE],
  ]);
  const pairs: [string, number][] = [];
  for (let i = 0; i + 1 < (ids?.length ?? 0); i += 2) pairs.push([String(ids[i]), Number(ids[i + 1])]);
  const raw: unknown[] = pairs.length ? await run(["HMGET", K("runs"), ...pairs.map((p) => p[0])]) : [];
  const runs = raw.map((r) => parse<SyncedRun>(r)).filter(isRun);
  const more = pairs.length === PAGE;
  return {
    projects: ((projects as unknown[]) ?? []).map((p) => parse<SyncedProject>(p)).filter(isProject),
    clearedAt: Number(cleared) || 0,
    runs,
    // The cursor only ever moves to a run this device has actually been handed.
    cursor: pairs.length ? pairs[pairs.length - 1][1] : since,
    more,
  };
}

export async function writeChanges(input: { projects?: unknown[]; runs?: unknown[]; clearedAt?: unknown }) {
  const projects = (input.projects ?? []).filter(isProject).slice(0, 200);
  const runs = (input.runs ?? []).filter(isRun).slice(0, 50);
  const askedClear = typeof input.clearedAt === "number" && input.clearedAt > 0 ? input.clearedAt : 0;

  const storedClear = Number(await run(["GET", K("clearedAt")])) || 0;
  const clearedAt = Math.max(storedClear, askedClear);
  const cmds: Cmd[] = [];
  let skipped = 0;

  if (projects.length) {
    const have: unknown[] = await run(["HMGET", K("projects"), ...projects.map((p) => p.id)]);
    projects.forEach((p, i) => {
      const old = parse<SyncedProject>(have[i]);
      if (old && changedAt(old) >= changedAt(p)) return;
      const clean: SyncedProject = { id: p.id, name: p.name.slice(0, 60), locked: p.deleted ? "" : p.locked.slice(0, 20_000), updatedAt: changedAt(p), ...(p.deleted ? { deleted: true } : {}) };
      cmds.push(["HSET", K("projects"), p.id, JSON.stringify(clean)]);
    });
  }

  const fresh = runs.filter((r) => r.at > clearedAt);
  if (fresh.length) {
    const have: unknown[] = await run(["HMGET", K("runs"), ...fresh.map((r) => r.id)]);
    const accepted: { r: SyncedRun; json: string }[] = [];
    fresh.forEach((r, i) => {
      const old = parse<SyncedRun>(have[i]);
      if (old && changedAt(old) >= changedAt(r)) return;
      const json = JSON.stringify(r);
      if (json.length > MAX_RUN_BYTES) { skipped++; return; }
      accepted.push({ r, json });
    });
    if (accepted.length) {
      const last = Number(await run(["INCRBY", K("seq"), accepted.length]));
      accepted.forEach(({ r, json }, i) => {
        cmds.push(["HSET", K("runs"), r.id, json]);
        cmds.push(["ZADD", K("runs:seq"), last - accepted.length + 1 + i, r.id]);
        cmds.push(["ZADD", K("runs:at"), r.at, r.id]);
      });
    }
  }
  if (clearedAt > storedClear) cmds.push(["SET", K("clearedAt"), clearedAt]);
  await runAll(cmds);

  // Housekeeping: drop what a "clear history" covers, then anything past the limit, oldest first.
  const [cleared, count] = await runAll([
    ["ZRANGEBYSCORE", K("runs:at"), "-inf", clearedAt],
    ["ZCARD", K("runs:at")],
  ]);
  let gone: string[] = (cleared as string[]) ?? [];
  const extra = Number(count) - gone.length - HISTORY_LIMIT;
  if (extra > 0) {
    const oldest: string[] = await run(["ZRANGEBYSCORE", K("runs:at"), `(${clearedAt}`, "+inf", "LIMIT", 0, extra]);
    gone = gone.concat(oldest ?? []);
  }
  if (gone.length) await runAll([["HDEL", K("runs"), ...gone], ["ZREM", K("runs:seq"), ...gone], ["ZREM", K("runs:at"), ...gone]]);

  return { clearedAt, skipped };
}
