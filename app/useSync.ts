"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HISTORY_LIMIT, changedAt, tidyRuns, type SyncedProject, type SyncedRun } from "@/lib/merge";

// Keeps this device and the server in step.
//
// The browser's own storage is still the working copy, so the app opens instantly and works offline.
// Syncing pulls what other devices changed, then sends what this device changed. It runs when the app
// opens, when you come back to it, shortly after any change, and once a minute while it's on screen.

export type SyncStatus =
  | { state: "starting" }
  | { state: "off" }                       // storage isn't connected
  | { state: "syncing" }
  | { state: "synced"; at: number }
  | { state: "failed"; reason: string };

interface Meta { cursor: number; pushedAt: number; clearedAt: number; partial?: boolean }
const META_KEY = "sb.sync";
const OVERLAP = 20;     // on opening, re-read the last few changes in case two devices wrote at the same moment
const BATCH = 10;       // runs per upload

const readMeta = (): Meta => {
  try { const v = JSON.parse(localStorage.getItem(META_KEY) || "null"); if (v && typeof v.cursor === "number") return { cursor: v.cursor, pushedAt: Number(v.pushedAt) || 0, clearedAt: Number(v.clearedAt) || 0, partial: !!v.partial }; } catch { /* fall through */ }
  return { cursor: 0, pushedAt: 0, clearedAt: 0 };
};
const writeMeta = (m: Meta) => { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* storage full or blocked */ } };

async function call(url: string, body?: unknown): Promise<any> {
  let r: Response;
  try {
    r = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error(navigator.onLine === false ? "You're offline." : "Couldn't reach Switchboard.");
  }
  if (r.status === 401) { window.location.href = "/login"; throw new Error("You've been signed out."); }
  const d = await r.json().catch(() => null);
  if (!r.ok || !d) throw new Error(typeof d?.error === "string" ? d.error : `Sync failed (${r.status}).`);
  return d;
}

export function useSync<P extends SyncedProject, R extends SyncedRun>(opts: {
  ready: boolean;                               // local data has been loaded
  projects: P[]; history: R[];
  // Fold in what other devices changed. The page merges into its latest state, so nothing typed mid-sync is lost.
  applyPulled: (projects: P[], runs: R[], clearedAt: number) => void;
  cacheIsPartial: () => boolean;                // this device's storage couldn't hold every run
}) {
  const [status, setStatus] = useState<SyncStatus>({ state: "starting" });
  const live = useRef(opts); live.current = opts;
  const meta = useRef<Meta | null>(null);
  const running = useRef(false);
  const again = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const off = useRef(false);
  const first = useRef(true);   // the first sync after the app opens

  const syncNow = useCallback(async () => {
    if (!live.current.ready || off.current) return;
    if (running.current) { again.current = true; return; }
    running.current = true;
    const m = (meta.current ??= readMeta());
    setStatus((s) => (s.state === "synced" ? s : { state: "syncing" }));
    try {
      // 1. Pull. A device whose storage couldn't hold everything starts from the beginning.
      let since = m.partial ? 0 : Math.max(0, m.cursor - (first.current ? OVERLAP : 0));
      first.current = false;
      let pulledRuns: R[] = []; let pulledProjects: P[] = []; let clearedAt = m.clearedAt;
      for (let page = 0; page < 12; page++) {
        const d = await call(`/api/sync?since=${since}`);
        if (d.connected === false) { off.current = true; setStatus({ state: "off" }); return; }
        pulledProjects = d.projects ?? [];
        pulledRuns = pulledRuns.concat(d.runs ?? []);
        clearedAt = Math.max(clearedAt, Number(d.clearedAt) || 0);
        since = Number(d.cursor) || since;
        if (!d.more) break;
      }
      m.cursor = Math.max(m.cursor, since);

      // 2. Fold the pulled changes into this device.
      const startedAt = Date.now();
      if (pulledProjects.length || pulledRuns.length || clearedAt > m.clearedAt) live.current.applyPulled(pulledProjects, pulledRuns, clearedAt);
      const clearChanged = clearedAt > m.clearedAt || clearedAt > (m.pushedAt || 0);
      m.clearedAt = clearedAt;

      // 3. Push what changed here since the last successful push.
      const mineP = live.current.projects.filter((p) => p.id !== "none");
      const sendP = mineP.some((p) => changedAt(p) > m.pushedAt) ? mineP : [];
      const sendR = tidyRuns(live.current.history.filter((r) => changedAt(r) > m.pushedAt), clearedAt);
      const clearToSend = clearChanged && clearedAt > 0 ? clearedAt : undefined;
      if (sendP.length || sendR.length || clearToSend) {
        const first = await call("/api/sync", { projects: sendP, runs: sendR.slice(0, BATCH), clearedAt: clearToSend });
        if (first.connected === false) { off.current = true; setStatus({ state: "off" }); return; }
        for (let i = BATCH; i < sendR.length; i += BATCH) await call("/api/sync", { runs: sendR.slice(i, i + BATCH) });
      }
      m.partial = live.current.cacheIsPartial();
      m.pushedAt = startedAt;
      writeMeta(m);
      setStatus({ state: "synced", at: Date.now() });
    } catch (e: any) {
      setStatus({ state: "failed", reason: e?.message ?? "Sync failed." });
    } finally {
      running.current = false;
      if (again.current) { again.current = false; void syncNow(); }
    }
  }, []);

  // Shortly after a change, so typing locked decisions doesn't send a request per keystroke.
  const syncSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void syncNow(); }, 1500);
  }, [syncNow]);

  // Clearing history has to reach the other devices too, so it's recorded as a moment in time.
  const markCleared = useCallback(() => {
    const m = (meta.current ??= readMeta());
    m.clearedAt = Date.now(); writeMeta(m);
    syncSoon();
    return m.clearedAt;
  }, [syncSoon]);

  useEffect(() => {
    if (!opts.ready) return;
    void syncNow();
    const onShow = () => { if (document.visibilityState === "visible") void syncNow(); };
    const tick = setInterval(() => { if (document.visibilityState === "visible") void syncNow(); }, 60_000);
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("online", onShow);
    return () => { clearInterval(tick); document.removeEventListener("visibilitychange", onShow); window.removeEventListener("online", onShow); if (timer.current) clearTimeout(timer.current); };
  }, [opts.ready, syncNow]);

  return { status, syncNow, syncSoon, markCleared, limit: HISTORY_LIMIT };
}
