// Sync rules, shared by the browser and the server so both sides decide the same way.
//
// Switchboard has one user on a few devices, so the rule is simple: for any project or run,
// the most recently changed copy wins. Deleting a project leaves a marker behind, so a device
// that was offline learns about the delete instead of bringing the project back.

export const HISTORY_LIMIT = 200;

export interface SyncedProject { id: string; name: string; locked: string; updatedAt?: number; deleted?: boolean }
export interface SyncedRun { id: string; at: number; updatedAt?: number }

export const changedAt = (x: { updatedAt?: number; at?: number }) => x.updatedAt ?? x.at ?? 0;

// Keep the newer copy of each item. On a tie the incoming copy is ignored, so re-sending is harmless.
export function mergeNewest<T extends { id: string; updatedAt?: number; at?: number }>(mine: T[], theirs: T[]): T[] {
  const byId = new Map(mine.map((x) => [x.id, x]));
  for (const t of theirs) {
    const m = byId.get(t.id);
    if (!m || changedAt(t) > changedAt(m)) byId.set(t.id, t);
  }
  return [...byId.values()];
}

// Newest first, nothing from before the last "clear history", capped at the limit.
export function tidyRuns<T extends SyncedRun>(runs: T[], clearedAt: number): T[] {
  return runs.filter((r) => r.at > clearedAt).sort((a, b) => b.at - a.at).slice(0, HISTORY_LIMIT);
}

export function isProject(p: any): p is SyncedProject {
  return !!p && typeof p.id === "string" && p.id.length <= 40 && typeof p.name === "string" && typeof p.locked === "string" && p.id !== "none";
}
export function isRun(r: any): r is SyncedRun {
  return !!r && typeof r.id === "string" && r.id.length <= 40 && typeof r.at === "number" && Array.isArray(r.results);
}
