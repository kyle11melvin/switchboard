// Monthly question caps, counted in the sync store (Upstash Redis).
//
// Each caller is counted by an id: for now the device id the app sends, later the signed-in user.
// Keys look like sb:usage:<id>:<YYYY-MM>. Without a connected store nothing is capped (local dev).

import { redis, storeConnected } from "./store";

const month = () => new Date().toISOString().slice(0, 7);
const K = (id: string) => `${process.env.SYNC_PREFIX || "sb"}:usage:${id}:${month()}`;

export interface UsageState { used: number; cap: number; left: number; capped: boolean }

// Reserve one question. Returns the state after reserving, or capped=true (and nothing reserved).
export async function reserve(id: string, cap: number): Promise<UsageState> {
  if (!storeConnected()) return { used: 0, cap, left: cap, capped: false };
  const used = Number(await redis(["INCR", K(id)]));
  if (used === 1) await redis(["EXPIRE", K(id), 60 * 60 * 24 * 40]);
  if (used > cap) {
    await redis(["DECR", K(id)]);
    return { used: used - 1, cap, left: 0, capped: true };
  }
  return { used, cap, left: cap - used, capped: false };
}

// Give one back when a question fails before any AI answered.
export async function release(id: string): Promise<void> {
  if (!storeConnected()) return;
  try { await redis(["DECR", K(id)]); } catch { /* best effort */ }
}

export async function usageOf(id: string, cap: number): Promise<UsageState> {
  if (!storeConnected()) return { used: 0, cap, left: cap, capped: false };
  const used = Number(await redis(["GET", K(id)])) || 0;
  return { used, cap, left: Math.max(0, cap - used), capped: used >= cap };
}
