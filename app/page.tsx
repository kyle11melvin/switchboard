"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { PRESETS, type Preset } from "@/lib/presets";
import { predictPreset } from "@/lib/predict";
import { IMAGE_STYLES } from "@/lib/imageStyles";
import { HISTORY_LIMIT, isProject, isRun, mergeNewest, tidyRuns } from "@/lib/merge";
import { useSync } from "./useSync";

type ProviderId = "openai" | "anthropic" | "xai" | "perplexity" | "gemini";
type Mode = "text" | "image";

interface ProviderInfo { id: ProviderId; label: string; configured: boolean; canImage: boolean; model: string }
interface RunResult { provider: ProviderId; model: string; text?: string; images?: string[]; citations?: string[]; promptOnly?: boolean; error?: string; ms: number }
// updatedAt and deleted exist for syncing: the newest copy wins, and a deleted project leaves a marker behind.
interface Project { id: string; name: string; locked: string; updatedAt?: number; deleted?: boolean }
interface HistoryItem {
  id: string; at: number; idea: string; brief: string; mode: Mode; projectName?: string;
  results: RunResult[]; verdict?: string; updatedAt?: number;
}

const LS = { projects: "sb.projects", history: "sb.history", project: "sb.project" };
const load = <T,>(k: string, fallback: T): T => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const save = (k: string, v: unknown): boolean => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
const STORAGE_FULL = "Couldn't save on this device. Browser storage is full or blocked, so this change will be lost on reload.";

// Stored data can be missing, hand-edited or from an older version: keep only entries with the right shape.
function loadProjects(): Project[] {
  const v = load<unknown>(LS.projects, []);
  const list = (Array.isArray(v) ? v : []).filter((p): p is Project => !!p && typeof p.id === "string" && typeof p.name === "string" && typeof p.locked === "string");
  // Projects from before syncing existed get a starting timestamp, so they're sent up once.
  return [DEFAULT_PROJECTS[0], ...list.filter((p) => p.id !== "none").map((p) => ({ ...p, updatedAt: p.updatedAt ?? 1 }))];
}
function loadHistory(): HistoryItem[] {
  const v = load<unknown>(LS.history, []);
  return (Array.isArray(v) ? v : [])
    .filter((h) => !!h && typeof h.id === "string" && Array.isArray(h.results))
    .map((h) => ({ ...h, idea: String(h.idea ?? ""), brief: String(h.brief ?? ""), mode: h.mode === "image" ? "image" : "text" }) as HistoryItem);
}
// History is the big one. The screen keeps every run; this device stores as many of the newest as fit.
// When some didn't fit, the next sync fetches the full list again.
const historyCache = { partial: false };
function saveHistory(list: HistoryItem[]): HistoryItem[] {
  let n = list;
  while (!save(LS.history, n) && n.length > 1) n = n.slice(0, Math.ceil(n.length / 2));
  historyCache.partial = n.length < list.length;
  return list;
}

// One place for every server call, so failures read the same everywhere.
async function api<T>(url: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error(typeof navigator !== "undefined" && navigator.onLine === false ? "You're offline. Reconnect and try again." : "Couldn't reach Switchboard. Check your connection and try again.");
  }
  if (r.status === 401) { window.location.href = "/login"; throw new Error("You've been signed out. Taking you to the login page."); }
  let d: any = null;
  try { d = await r.json(); } catch (e: any) {
    // The reply started but was cut off part-way (a dropped connection), as opposed to a non-JSON page.
    if (r.ok && e?.name !== "SyntaxError") throw new Error("The connection dropped before the answer finished arriving. Try again.");
  }
  if (r.status === 504 || r.status === 408) throw new Error("Timed out waiting for the model. Try again.");
  if (!r.ok) throw new Error(typeof d?.error === "string" && d.error ? d.error : `Server error (${r.status}). Try again.`);
  if (d === null) throw new Error("Got an unreadable reply from the server. Try again.");
  return d as T;
}
// Smooth scrolling is movement too: jump straight there for people who've asked for less motion.
const scrollBehavior = (): ScrollBehavior => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
const uid = () => Math.random().toString(36).slice(2, 10);

const DOMAIN: Record<ProviderId, string> = { openai: "openai.com", anthropic: "anthropic.com", xai: "x.ai", perplexity: "perplexity.ai", gemini: "gemini.google.com" };
const MONO: Record<ProviderId, string> = { openai: "C", anthropic: "A", xai: "X", perplexity: "P", gemini: "G" };

// The markdown renderer is the heaviest code on the page and isn't needed until an answer lands, so it loads separately.
const Revise = dynamic(() => import("./Revise"), { ssr: false, loading: () => <Skeleton /> });

// One trip out to the AIs and back. Earlier rounds stay on screen so they can be compared.
interface Round { n: number; brief: string; mode: Mode; results: RunResult[]; verdict: string }
const loadMarkdown = () => import("./Markdown");
const Markdown = dynamic(loadMarkdown, { ssr: false, loading: () => <Skeleton /> });

const HISTORY_PAGE = 30; // runs listed before "Show all"

const DEFAULT_PROJECTS: Project[] = [{ id: "none", name: "No project", locked: "" }];

export default function Home() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [brain, setBrain] = useState<ProviderId>("anthropic");
  const [projects, setProjects] = useState<Project[]>(DEFAULT_PROJECTS);
  const [projectId, setProjectId] = useState("none");
  const [editingProject, setEditingProject] = useState(false);
  const [naming, setNaming] = useState(false); // the "new project" form is showing
  const [picking, setPicking] = useState(false); // the project list is open
  const [newName, setNewName] = useState("");

  const [idea, setIdea] = useState("");
  const [preset, setPreset] = useState<Preset>(PRESETS[1]);
  const [mode, setMode] = useState<Mode>(PRESETS[1].mode);
  const [selected, setSelected] = useState<ProviderId[]>(PRESETS[1].models);
  const [autoJudge, setAutoJudge] = useState(true);
  const [imgStyle, setImgStyle] = useState("auto");
  const [presetLocked, setPresetLocked] = useState(false); // true once the person picks a preset by hand
  const [modelsLocked, setModelsLocked] = useState(false); // true once the person taps an AI by hand
  // What was picked on Send, and for which question. Until then nothing is shown as chosen.
  const [routed, setRouted] = useState<{ idea: string; why: string; guessed?: boolean } | null>(null);
  const [picking2, setPicking2] = useState(false); // working out the job and the AIs
  const [judgeWith, setJudgeWith] = useState<ProviderId>("anthropic");

  const [brief, setBrief] = useState("");
  const [briefFor, setBriefFor] = useState("");
  const [notice, setNotice] = useState("");
  const [photos, setPhotos] = useState<string[]>([]); // attached photos, shrunk, as data URLs
  const [photoNote, setPhotoNote] = useState("");
  const photoInput = useRef<HTMLInputElement>(null); // a quiet note about this run, kept until the next one // the question the improved version was written from
  const [briefing, setBriefing] = useState(false);
  const [rounds, setRounds] = useState<Round[]>([]);   // earlier rounds of this idea, oldest first
  const [revising, setRevising] = useState(false);     // the Revise conversation is open
  const [showAnswers, setShowAnswers] = useState(false); // individual answers, once a verdict has replaced them
  const [briefOpen, setBriefOpen] = useState(true); // folds away once answers arrive, so the verdict is what you see
  const [results, setResults] = useState<Record<string, RunResult | "loading">>({});
  const [verdict, setVerdict] = useState("");
  const [judging, setJudging] = useState(false);
  const [err, setErr] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [runPrompt, setRunPrompt] = useState("");
  const [askedIdea, setAskedIdea] = useState("");
  const [askOpen, setAskOpen] = useState(false); // after a run the idea panel folds to one line; Edit reopens it
  const [useOriginal, setUseOriginal] = useState(false); // "Use my original instead": next ask sends the raw idea
  const [fromHistory, setFromHistory] = useState(false); // a picture run opened from history has no pictures; offer Redraw
  const [modelsOpen, setModelsOpen] = useState(false); // the AI row is one line until tapped
  const [announce, setAnnounce] = useState(""); // read out by screen readers when answers and verdicts land
  const resultsRef = useRef<HTMLDivElement>(null);
  const activeRun = useRef<string | null>(null); // results from any other run are stale and ignored

  useEffect(() => {
    api<{ providers: ProviderInfo[]; brain: ProviderId }>("/api/status").then((d) => {
      if (!Array.isArray(d.providers)) throw new Error("Couldn't load the list of AIs. Reload the page.");
      setProviders(d.providers);
      if (d.brain) { setBrain(d.brain); setJudgeWith(d.brain); }
    }).catch((e) => setErr(e.message));
    setProjects(loadProjects());
    const pid = load<unknown>(LS.project, "none");
    setProjectId(typeof pid === "string" ? pid : "none");
    setHistory(loadHistory());
    setLoaded(true);
    // Fetch the renderer once the page has settled, so it's ready before the first answer arrives.
    const t = setTimeout(() => { loadMarkdown().catch(() => {}); }, 1200);
    return () => clearTimeout(t);
  }, []);

  const applyPulled = useCallback((ps: Project[], rs: HistoryItem[], clearedAt: number) => {
    const okProjects = ps.filter(isProject);
    if (okProjects.length) setProjects((cur) => { const next = [DEFAULT_PROJECTS[0], ...mergeNewest(cur.filter((p) => p.id !== "none"), okProjects)]; save(LS.projects, next); return next; });
    const usable = rs.filter((r) => isRun(r) && typeof r.idea === "string" && typeof r.brief === "string");
    setHistory((h) => saveHistory(tidyRuns(mergeNewest(h, usable), clearedAt)));
  }, []);
  const sync = useSync<Project, HistoryItem>({ ready: loaded, projects, history, applyPulled, cacheIsPartial: () => historyCache.partial });

  const shownProjects = projects.filter((p) => !p.deleted);
  const project = shownProjects.find((p) => p.id === projectId) ?? shownProjects[0];
  const projectCtx = project && project.id !== "none" ? { name: project.name, locked: project.locked } : null;
  const styleNote = mode === "image" ? IMAGE_STYLES.find((x) => x.id === imgStyle)?.note : undefined;
  const noteFor = [preset.mode === mode ? preset.note : undefined, styleNote].filter(Boolean).join("\n\n") || undefined;
  const byId = useMemo(() => Object.fromEntries(providers.map((p) => [p.id, p])), [providers]);
  const label = (id: ProviderId) => byId[id]?.label ?? id;
  // Chips show a choice only once there is one: picked by hand, or picked on Send for this question.
  const showChoice = presetLocked || modelsLocked || routed?.idea === idea;
  const noteOf = (p: Preset, m: Mode) => [p.mode === m ? p.note : undefined, m === "image" ? IMAGE_STYLES.find((x) => x.id === imgStyle)?.note : undefined].filter(Boolean).join("\n\n") || undefined;

  function applyPreset(p: Preset) {
    // A brief is written for words or for a picture, never both. Switching kind makes the old one wrong.
    if (p.mode !== mode) setBrief("");
    setPreset(p); setMode(p.mode); setSelected(p.models); setAutoJudge(p.judge);
  }
  function pickPreset(p: Preset) { setPresetLocked(true); applyPreset(p); }
  useEffect(() => { if (!idea.trim()) { setPresetLocked(false); setModelsLocked(false); } }, [idea]);
  useEffect(() => {
    if (!picking) return;
    const away = (e: Event) => { if (!(e.target as Element)?.closest?.(".projwrap")) setPicking(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setPicking(false); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [picking]);
  // Nothing is guessed while typing. The job and the AIs are picked on Send, from the whole question.
  function onIdeaChange(v: string) { setIdea(v); }
  function toggle(id: ProviderId) {
    // Before anything is picked, the first tap starts the list with that one AI.
    setSelected((s) => (!showChoice ? [id] : s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    setModelsLocked(true);
  }

  // Work out the kind of job and the AIs, unless the person already chose them by hand.
  // Falls back to the keyword guess if the AI can't be reached.
  async function route(): Promise<{ preset: Preset; models: ProviderId[] }> {
    const keep = { preset, models: selected };
    if (presetLocked) return keep;
    setPicking2(true);
    try {
      const d = await api<{ job?: string; ais?: ProviderId[]; why?: string; error?: string }>("/api/pick", { idea, brain, photos: photos.length });
      if (d.error) throw new Error(d.error);
      const p = PRESETS.find((x) => x.id === d.job);
      if (!p) throw new Error("no job came back");
      const models = modelsLocked ? selected : d.ais?.length ? d.ais : p.models;
      if (p.mode !== mode) setBrief("");
      setPreset(p); setMode(p.mode); setSelected(models); setRouted({ idea, why: d.why ?? "" });
      return { preset: p, models };
    } catch (e: any) {
      const p = PRESETS.find((x) => x.id === predictPreset(idea, { photos: photos.length > 0 })) ?? preset;
      const models = modelsLocked ? selected : p.models;
      setPreset(p); setMode(p.mode); setSelected(models);
      setRouted({ idea, why: `Couldn't pick automatically (${e.message}), so it guessed from the words.`, guessed: true });
      return { preset: p, models };
    } finally { setPicking2(false); }
  }
  function updateProjects(next: Project[]) { setProjects(next); if (!save(LS.projects, next)) setErr(STORAGE_FULL); sync.syncSoon(); }
  function createProject(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim().slice(0, 60);
    if (!name) return;
    const np = { id: uid(), name, locked: "", updatedAt: Date.now() };
    updateProjects([...projects, np]); chooseProject(np.id);
    setNaming(false); setNewName(""); setEditingProject(true);
  }
  function chooseProject(id: string) { setProjectId(id); save(LS.project, id); }

  // Every question is improved before it goes out: people don't know what to ask for, and that's the point.
  // Returns the improved question, or null when improving failed (the original is then used as-is).
  async function sharpen(m: Mode = mode, note = noteFor): Promise<string | null> {
    if (!idea.trim()) return null;
    setErr(""); setBriefing(true);
    try {
      const d = await api<{ brief?: string; error?: string }>("/api/brief", { idea, mode: m, project: projectCtx, presetNote: note, brain, photos });
      if (d.error) throw new Error(d.error);
      if (!d.brief) throw new Error("came back empty");
      setBrief(d.brief); setBriefFor(idea); setBriefOpen(false);
      return d.brief;
    } catch (e: any) {
      setNotice(`Couldn't improve the question (${e.message}), so it was asked as written.`);
      return null;
    } finally { setBriefing(false); }
  }

  async function judge(finalResults: RunResult[], promptUsed: string, id: string) {
    const answers = finalResults.filter((r) => r.text && !r.error).map((r) => ({ label: `${label(r.provider)} (${r.model})`, text: r.text!, citations: r.citations }));
    if (answers.length < 1 || judging) return;
    setErr(""); setJudging(true); setVerdict("");
    try {
      const d = await api<{ verdict?: string; error?: string }>("/api/judge", { brief: promptUsed, answers, project: projectCtx, judge: judgeWith });
      if (d.error) throw new Error(d.error);
      if (!d.verdict) throw new Error("The verdict came back empty.");
      const v = d.verdict;
      // Keep the verdict with its run even if the screen has moved on to something else.
      setHistory((h) => saveHistory(h.map((x) => (x.id === id ? { ...x, verdict: v, updatedAt: Date.now() } : x))));
      sync.syncSoon();
      if (activeRun.current !== id) return;
      setVerdict(v); setAnnounce("Top answer ready.");
    } catch (e: any) { if (activeRun.current === id) setErr(`Couldn't get the top answer: ${e.message} Tap "Get the top answer" to try again.`); } finally { setJudging(false); }
  }

  async function runOne(provider: ProviderId, prompt: string, id: string, m: Mode = mode, note = noteFor): Promise<RunResult> {
    let res: RunResult;
    try {
      const d = await api<Partial<RunResult>>("/api/run", { provider, mode: m, prompt, project: projectCtx, presetNote: note, photos });
      res = { model: "", ms: 0, ...d, provider };
      if (!res.error && !res.text && !res.images?.length) res.error = "Came back empty. Try again.";
    } catch (e: any) {
      res = { provider, model: "", error: e.message, ms: 0 };
    }
    if (activeRun.current === id) {
      setResults((prev) => ({ ...prev, [provider]: res }));
      setAnnounce(res.error ? `${label(provider)} failed: ${res.error}` : `${label(provider)} answered.`);
    }
    return res;
  }

  async function retry(provider: ProviderId) {
    const id = runId;
    if (!id || !runPrompt || results[provider] === "loading") return;
    activeRun.current = id;
    setResults((prev) => ({ ...prev, [provider]: "loading" }));
    const res = await runOne(provider, runPrompt, id);
    setHistory((h) => saveHistory(h.map((x) => (x.id === id ? { ...x, updatedAt: Date.now(), results: x.results.map((r) => (r.provider === provider ? { ...res, images: undefined } : r)) } : x))));
    sync.syncSoon();
  }

  // Clear the screen for a fresh question. Projects and history stay.
  function startOver() {
    activeRun.current = null; setRunId(null); setRunPrompt(""); setAskedIdea(""); setErr(""); setNotice(""); setPhotos([]); setRounds([]); setRevising(false);
    setResults({}); setVerdict(""); setBrief(""); setBriefFor(""); setIdea(""); setPresetLocked(false); setModelsLocked(false); setRouted(null);
    setAskOpen(false); setUseOriginal(false); setFromHistory(false); setModelsOpen(false);
    // A fresh question starts as words. Otherwise a picture run would quietly make the next question a picture too.
    if (mode !== "text") applyPreset(PRESETS[1]);
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
    setTimeout(() => document.getElementById("idea")?.focus({ preventScroll: true }), 50);
  }
  async function send(useThis?: string) {
    // Cmd+Enter lands here too, so guard against a second run while one is in flight.
    if (!(useThis ?? idea).trim() || running || briefing || picking2) return;
    if (!providers.some((p) => p.configured)) return;
    const lastMode = mode, lastDone = done, lastVerdict = verdict;
    setErr(""); setNotice("");
    // First: what kind of job is this and who should answer it. Done once per question.
    let plan = { preset, models: selected };
    if (!useThis && !showChoice) { setResults({}); setVerdict(""); plan = await route(); }
    const m = plan.preset.mode;
    const note = noteOf(plan.preset, m);
    const targets = plan.models.filter((s) => byId[s]?.configured);
    if (!targets.length) { setErr("None of the chosen AIs are set up. Tap one that is, then ask again."); return; }
    // Use the improved question if it's still for this idea and this kind of job; otherwise improve it now.
    let prompt = (useThis ?? (brief && briefFor === idea && m === lastMode ? brief : "")).trim();
    if (!prompt) {
      setResults({}); setVerdict("");
      prompt = ((await sharpen(m, note)) ?? idea).trim();
      if (!prompt) return;
    }
    // Sending again keeps what came back last time as an earlier round.
    if (lastDone.length) setRounds((all) => [...all, { n: all.length + 1, brief: runPrompt, mode: lastMode, results: lastDone, verdict: lastVerdict }]);
    setRevising(false);
    setVerdict(""); setBriefOpen(false); setShowAnswers(false);
    const id = uid(); setRunId(id); setRunPrompt(prompt); setAskedIdea(idea); activeRun.current = id;
    setAskOpen(false); setUseOriginal(false); setFromHistory(false);
    setAnnounce(`Sent to ${targets.map(label).join(", ")}.`);
    setResults(Object.fromEntries(targets.map((s) => [s, "loading" as const])));
    setTimeout(() => window.scrollTo({ top: 0, behavior: scrollBehavior() }), 50);

    const finished = await Promise.all(targets.map((provider) => runOne(provider, prompt, id, m, note)));

    const now = Date.now();
    const item: HistoryItem = {
      id, at: now, updatedAt: now, idea, brief: prompt, mode: m, projectName: projectCtx?.name,
      // Images are big; keep history light by storing text only.
      results: finished.map((r) => ({ ...r, images: undefined })),
    };
    setHistory((h) => saveHistory([item, ...h].slice(0, HISTORY_LIMIT)));
    sync.syncSoon();

    if (activeRun.current === id && m === "text" && autoJudge && finished.filter((r) => r.text && !r.error).length >= 2) {
      judge(finished, prompt, id);
    }
  }

  function openHistory(h: HistoryItem) {
    setIdea(h.idea); setBrief(h.brief === h.idea ? "" : h.brief); setBriefFor(h.idea); setMode(h.mode);
    // Keep the task chip in step with the kind of run, or its instructions would leak into the wrong kind.
    if (h.mode === "image" && preset.mode !== "image") { const p = PRESETS.find((x) => x.mode === "image"); if (p) { setPreset(p); setSelected(p.models); setAutoJudge(p.judge); } }
    if (h.mode === "text" && preset.mode !== "text") { const p = PRESETS.find((x) => x.id === (predictPreset(h.idea) ?? "copy")) ?? PRESETS.find((x) => x.mode === "text"); if (p) { setPreset(p); setSelected(p.models); setAutoJudge(p.judge); } }
    setPresetLocked(true); setModelsLocked(true); setSelected(h.results.map((r) => r.provider));
    setResults(Object.fromEntries(h.results.map((r) => [r.provider, r])));
    setVerdict(h.verdict ?? ""); setRunId(h.id); setRunPrompt(h.brief); setAskedIdea(h.idea); activeRun.current = h.id; setErr(""); setShowHistory(false); setBriefOpen(false); setShowAnswers(false); setRounds([]); setRevising(false);
    setAskOpen(false); setUseOriginal(false); setFromHistory(true); setPhotos([]);
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  }

  const sendable = selected.filter((s) => byId[s]?.configured);
  const done = Object.values(results).filter((r) => r !== "loading") as RunResult[];
  const running = Object.values(results).some((r) => r === "loading");
  const failedCount = done.filter((r) => r.error).length;
  const verdictParts = useMemo(() => splitVerdict(verdict), [verdict]);
  const canJudge = mode === "text" && done.filter((r) => r.text && !r.error).length >= 2 && !running && !judging;
  // Results are in and the question hasn't been edited since: the next move is New ask, not asking the same thing again.
  const settled = done.length > 0 && !running && !judging && !briefing;
  // An edited improved question, "use my original", or a history picture run each have their own ask-again.
  const briefEdited = settled && !!brief.trim() && !!runPrompt && brief.trim() !== runPrompt.trim();
  const redraw = settled && fromHistory && mode === "image" && !done.some((r) => r.images?.length);
  const askAgain = !settled ? null : useOriginal ? { label: "Ask with my original →", go: () => send(idea) } : briefEdited ? { label: "Ask again with this →", go: () => send(brief) } : redraw ? { label: "Redraw →", go: () => send(runPrompt) } : null;
  const finished = settled && idea.trim() === askedIdea.trim() && !askAgain;
  // One line that always says what to do next. Assumes nothing.
  const anyAI = providers.some((p) => p.configured);
  const askLabel = !showChoice ? "Ask" : sendable.length > 2 ? `Ask ${sendable.length} AIs` : sendable.length ? `Ask ${sendable.map(label).join(" + ")}` : "";
  const nextStep = !anyAI ? "No AIs are set up yet."
    : showChoice && !sendable.length ? "Pick at least one AI above."
    : picking2 ? "Working out what kind of job this is and who should answer."
    : running ? (mode === "image" ? "Drawing. Pictures take about half a minute." : "Asking. Answers take up to a minute.")
    : judging ? "Working out the top answer. About a minute."
    : done.length && failedCount === done.length ? (done.length > 1 ? "None of them answered. Tap Try again on each, or ask again." : "It didn't answer. Tap Try again.")
    : askAgain ? (useOriginal ? "Tap Ask with my original to send your words as typed." : briefEdited ? "Tap Ask again with this to send the edited question." : "Pictures aren't kept. Tap Redraw to make them again.")
    : done.length && !finished ? `Tap ${askLabel} to ask the new question.`
    : verdict ? "Done. Copy the answer. Change something to adjust it, or New ask to move on."
    : done.length && mode === "image" ? "Done. Save the one you like. Change something to adjust it, or New ask to move on."
    : done.length && canJudge ? "Answers are in. Tap Get the top answer."
    : done.length ? "Done. Change something to adjust it, or New ask to move on."
    : briefing ? "Improving your question first."
    : idea.trim() && !showChoice ? `Tap Ask. It picks the AIs, improves your question, then asks.${photos.length ? " Your photos go along." : ""}`
    : idea.trim() ? `Tap ${askLabel}. It improves your question first, then asks.${photos.length ? " Your photos go along." : ""}`
    : "Type what you need in the box above.";

  const briefPanel = brief && !briefing && !running && !judging && !useOriginal ? (
        <section className="panel briefpanel">
          <div className="row briefhead">
            <button className="brieftoggle" aria-expanded={briefOpen} aria-controls="brief" onClick={() => setBriefOpen((v) => !v)}>
              <span className="lbl">{briefOpen ? "The improved question · edit it and ask again" : "See the improved question"}</span>
            </button>
            <button className="ghost small" onClick={() => { if (settled) setUseOriginal(true); else { setBrief(""); setBriefFor(""); } }}>Use my original instead</button>
          </div>
          {briefOpen && <textarea id="brief" rows={10} aria-label="Your improved question" value={brief} onChange={(e) => setBrief(e.target.value)} />}
        </section>
  ) : null;

  return (
    <main>
      <header className="top">
        <h1 className="brand"><Mark size={44} /><span className="brandtext">Switchboard<span>ask once · get the top answer</span></span></h1>
        <div className="topright">
          <div className="projwrap">
            <button className={`projpill ${project?.id !== "none" ? "has" : "none"}`} aria-label={project?.id !== "none" ? `Project: ${project.name}` : "Project"} aria-expanded={picking} aria-haspopup="menu" aria-controls="projects" onClick={() => { setPicking((v) => !v); setNaming(false); }}>
              <svg className="folder" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
              <span>{project?.id !== "none" ? project.name : "No project"}</span>
              <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
            {picking && (
              <div className="projmenu" id="projects" role="menu" aria-label="Projects">
                <button role="menuitemradio" aria-checked={project?.id === "none"} className={project?.id === "none" ? "on" : ""} onClick={() => { chooseProject("none"); setEditingProject(false); setPicking(false); }}>
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>No project
                </button>
                {shownProjects.filter((p) => p.id !== "none").map((p) => (
                  <button key={p.id} role="menuitemradio" aria-checked={project?.id === p.id} className={project?.id === p.id ? "on" : ""} onClick={() => { chooseProject(p.id); setEditingProject(false); setPicking(false); }}>
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>{p.name}
                  </button>
                ))}
                <button role="menuitem" className="new" onClick={() => { setPicking(false); setNaming(true); }}>
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>New project…
                </button>
                <p>A project holds things every AI should always know, like a brand's colors or a client's situation.</p>
              </div>
            )}
          </div>
          <button className="iconbtn" aria-label={history.length ? `History, ${history.length} run${history.length === 1 ? "" : "s"}` : "History"} aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            {history.length > 0 && <span className="badge" aria-hidden="true">{history.length}</span>}
          </button>
        </div>
      </header>

      {showHistory && (
        <section className="panel" aria-label="History">
          <SyncLine status={sync.status} onRetry={sync.syncNow} />
          {history.length === 0 && <p className="muted">Nothing asked yet.</p>}
          {(showAllHistory ? history : history.slice(0, HISTORY_PAGE)).map((h) => (
            <button key={h.id} className="hist" onClick={() => openHistory(h)}>
              <span>{h.idea.trim().slice(0, 90) || h.brief.trim().slice(0, 90) || "Untitled question"}</span>
              <small>{new Date(h.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · {h.results.map((r) => label(r.provider)).join(", ")}{h.verdict ? " · judged" : ""}{h.projectName ? ` · ${h.projectName}` : ""}</small>
            </button>
          ))}
          {history.length > HISTORY_PAGE && !showAllHistory && (
            <button className="ghost small showall" onClick={() => setShowAllHistory(true)}>Show all {history.length}</button>
          )}
          {history.length > 0 && (
            <ConfirmButton label="Clear history" question={sync.status.state === "off" ? "Clear all history?" : "Clear all history on every device?"} yes="Clear" no="Keep" onYes={() => { sync.markCleared(); setHistory([]); save(LS.history, []); historyCache.partial = false; setShowAllHistory(false); }} />
          )}
        </section>
      )}

      {naming && (
        <form className="panel newproject" onSubmit={createProject}>
          <label className="lbl" htmlFor="newproject">New project</label>
          <div className="row">
            <input id="newproject" autoFocus maxLength={60} value={newName} placeholder="Project name" autoComplete="off"
              onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { setNaming(false); setNewName(""); } }} />
            <button className="primary small" disabled={!newName.trim()}>Create</button>
            <button type="button" className="ghost small" onClick={() => { setNaming(false); setNewName(""); }}>Cancel</button>
          </div>
        </form>
      )}

      {project?.id !== "none" && !naming && (
        <section className="lockbar">
          <button className="lockline" aria-expanded={editingProject} onClick={() => setEditingProject((v) => !v)}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
            <span>{project.locked.trim() ? (() => { const c = project.locked.split("\n").filter((l) => l.trim()).length; return `${c} thing${c === 1 ? "" : "s"} it always knows about this project`; })() : "Tell it what it should always know about this project"}</span>
            <span className="chev">{editingProject ? "Done" : "Edit"}</span>
          </button>
          {editingProject && (
            <div className="lockeditor">
              <textarea rows={6} value={project.locked} aria-label={`Things it should always know about ${project.name}, one per line`}
                placeholder={"One per line. Every AI is told these are settled.\ne.g. Single-file HTML, no framework\ne.g. Brand colors navy #1B2A4A / gold #C9A84C"}
                onChange={(e) => updateProjects(projects.map((p) => (p.id === project.id ? { ...p, locked: e.target.value, updatedAt: Date.now() } : p)))} />
              <ConfirmButton danger label="Delete project" question={`Delete “${project.name}” and what it knows about it?`} yes="Delete" no="Keep"
                onYes={() => {
                  // Leave a marker instead of removing it, so your other devices delete it too.
                  updateProjects(projects.map((p) => (p.id === project.id ? { ...p, locked: "", deleted: true, updatedAt: Date.now() } : p)));
                  chooseProject("none"); setEditingProject(false);
                }} />
            </div>
          )}
        </section>
      )}

      {/* After a run the idea folds to one line so the answer comes first. Edit reopens it. */}
      {settled && !askOpen && (
        <section className="panel asked">
          <div className="row askedrow">
            <div className="askedtext"><span className="lbl">You asked</span><p>{askedIdea || runPrompt}</p></div>
            <button className="ghost small" onClick={() => { setAskOpen(true); setTimeout(() => document.getElementById("idea")?.focus({ preventScroll: true }), 50); }}>Edit</button>
          </div>
          {photos.length > 0 && <div className="photorow small">{photos.map((src, i) => <span key={i} className="photo"><img src={src} alt={`Attached photo ${i + 1}`} /></span>)}</div>}
        </section>
      )}

      {/* Idea. Folds away while the AIs work, so the working screen is what you see. */}
      <section className="panel idea" hidden={picking2 || briefing || running || judging || (settled && !askOpen)}>
        <div className="row"><label className="lbl" htmlFor="idea">Ask anything</label><span className="modepill">{!showChoice ? "Auto" : mode === "image" ? "Picture" : "Words"}</span></div>
        <textarea id="idea" rows={4} value={idea} onChange={(e) => onIdeaChange(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); send(); } }}
          placeholder="Type your question or what you want made. Rough is fine." />
        <div className="photorow">
          {photos.map((src, i) => (
            <span key={i} className="photo">
              <img src={src} alt={`Attached photo ${i + 1}`} />
              <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => setPhotos((all) => all.filter((_, j) => j !== i))}>×</button>
            </span>
          ))}
          {photos.length < 5 && (
            <button type="button" className="ghost small addphoto" onClick={() => photoInput.current?.click()}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 9" /></svg>
              {photos.length ? "Add another" : "Add photos"}
            </button>
          )}
          <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={async (e) => {
            const files = Array.from(e.target.files ?? []).slice(0, 5 - photos.length);
            e.target.value = "";
            setPhotoNote("");
            const added = (await Promise.all(files.map((f) => shrinkFile(f)))).filter((x): x is string => !!x);
            if (added.length < files.length) setPhotoNote("One of those files couldn't be read as a photo.");
            if (added.length) setPhotos((all) => [...all, ...added].slice(0, 5));
          }} />
          {photoNote && <span className="muted">{photoNote}</span>}
        </div>

        <div className="chips" role="group" aria-label="What kind of help">
          {PRESETS.map((p) => (
            <button key={p.id} aria-pressed={showChoice && preset.id === p.id} className={`chip ${showChoice && preset.id === p.id ? "on" : ""}`} onClick={() => pickPreset(p)}><PresetIcon id={p.id} />{p.label}{!presetLocked && routed?.idea === idea && preset.id === p.id && <small className="auto"> · auto</small>}</button>
          ))}
        </div>

        {showChoice && mode === "image" && !selected.some((s) => byId[s]?.configured && byId[s]?.canImage) && (
          <p className="hint">None of the selected AIs can draw. They'll write you a ready-to-paste picture prompt instead.</p>
        )}
        {showChoice && mode === "image" && (
          <div className="chips styles" role="group" aria-label="Kind of picture">
            {IMAGE_STYLES.map((st) => (
              <button key={st.id} aria-pressed={imgStyle === st.id} className={`chip sm ${imgStyle === st.id ? "on" : ""}`} onClick={() => setImgStyle(st.id)}>{st.label}</button>
            ))}
          </div>
        )}
        {!modelsOpen && providers.some((p) => p.configured) && (!showChoice || sendable.length > 0) ? (
          // One line instead of five chips. Before a pick it says what will happen; after, who is answering.
          <button className="modelsline" aria-expanded={false} onClick={() => setModelsOpen(true)}>
            {showChoice ? (<>
              <span className="modelslogos">{sendable.map((id) => <Logo key={id} id={id} />)}</span>
              <span>Asking {sendable.map(label).join(" + ")}</span>
              <span className="muted">change</span>
            </>) : (<>
              <span className="modelslogos">{providers.filter((p) => p.configured).map((p) => <Logo key={p.id} id={p.id} />)}</span>
              <span>It picks the AIs that suit the question</span>
              <span className="muted">choose</span>
            </>)}
          </button>
        ) : (
        <div className="chips models" role="group" aria-label="Which AIs answer">
          {providers.map((p) => {
            const disabled = !p.configured;
            const why = !p.configured ? "not set up" : showChoice && mode === "image" && !p.canImage ? "writes the prompt only" : "";
            return (
              <button key={p.id} disabled={disabled} aria-pressed={showChoice && selected.includes(p.id) && !disabled}
                className={`chip model ${p.id} ${showChoice && selected.includes(p.id) && !disabled ? "on" : ""}`}
                onClick={() => toggle(p.id)} title={p.model}>
                <Logo id={p.id} />{p.label}{why && <small> · {why}</small>}
              </button>
            );
          })}
        </div>
        )}
        {showChoice && !presetLocked && routed?.idea === idea && routed.why && (
          <p className="hint" role="status">{routed.guessed ? "" : "Picked for you: "}{routed.why} Tap a chip to change it.</p>
        )}
        {(mode === "text" || !showChoice) && providers.some((p) => p.configured) && (
          <div className="row judgeRow">
            <label className="switch"><input type="checkbox" checked={autoJudge} onChange={(e) => setAutoJudge(e.target.checked)} /><span className="track"><span className="knob" /></span> Get the top answer</label>
            <select className="inline" aria-label="Which AI picks the top answer" value={judgeWith} onChange={(e) => setJudgeWith(e.target.value as ProviderId)}>
              {providers.filter((p) => p.configured).map((p) => <option key={p.id} value={p.id}>by {p.label}</option>)}
            </select>
          </div>
        )}
      </section>

      {/* The improved question: next to the box before a run, after the answer once there is one. */}
      {briefPanel && !settled && briefPanel}

      {revising && (
        <Revise idea={idea} brief={runPrompt || brief || idea} mode={mode} project={projectCtx} brain={brain}
          results={done.map((r) => ({ name: label(r.provider), text: r.text, error: r.error, images: r.images }))}
          onClose={() => setRevising(false)}
          onBrief={(b) => {
            // One step: the change becomes the new question and goes straight out.
            setBrief(b); setBriefFor(idea); setBriefOpen(false); setRevising(false);
            void send(b);
          }} />
      )}

      {err && <div className="error" role="alert">{err}</div>}
      {notice && !briefing && !running && <p className="hint" role="status">{notice}</p>}
      <div className="sr" role="status" aria-live="polite">{announce}</div>

      <div ref={resultsRef} className="anchor" />

      {(picking2 || briefing || running || judging) && (
        <section className="panel working" aria-live="polite">
          <Mark size={96} />
          <h2>{picking2 ? "Working out who should answer…" : briefing ? "Improving your question…" : running ? `Asking ${Object.keys(results).length} AI${Object.keys(results).length === 1 ? "" : "s"}…` : "Working out the top answer…"}</h2>
          {!picking2 && routed?.idea === idea && !presetLocked && (
            <p className="muted"><strong>{preset.label} · {selected.filter((s) => byId[s]?.configured).map(label).join(" + ")}</strong>{routed.why ? `. ${routed.why}` : ""}</p>
          )}
          <p className="muted">{picking2 ? "Reading what you asked to pick the kind of job and the AIs that suit it." : briefing ? "Turning what you typed into a question the AIs will answer well." : running ? "Each one answers on its own. Then one of them picks the best of all of them." : `${label(judgeWith)} is reading every answer and writing the top one.`}</p>
          {!briefing && !picking2 && <ul className="progress">
            {Object.entries(results).map(([pid, r]) => (
              <li key={pid} className={r === "loading" ? "wait" : r.error ? "bad" : "done"}>
                <Logo id={pid as ProviderId} /><span>{label(pid as ProviderId)}</span>
                <small>{r === "loading" ? (running ? "Thinking…" : "") : r.error ? "Failed" : "Done"}</small>
                <i><b /></i>
              </li>
            ))}
          </ul>}
          {!picking2 && <p className="muted small">This usually takes about a minute.</p>}
        </section>
      )}

      {/* Verdict first — it's the thing you actually use */}
      {verdict && !judging && (
        <section className="panel verdict">
          <div className="row">
            <h2 className="lbl">{judging ? "Working out the top answer…" : `Top answer · by ${label(judgeWith)}`}</h2>
            {verdict && <CopyBtn text={bestAnswer(verdict)} label="Copy" />}
          </div>
          {judging ? <Skeleton /> : (() => {
            const { best, rest, flags, sources, measured } = verdictParts;
            return (
              <>
                <div className="best md"><Markdown text={best} /></div>
                {/* The answer is the point. How it was reached stays folded until asked for. */}
                <details className="grading">
                  <summary>{flags > 0 ? `${flags} problem${flags === 1 ? "" : "s"} caught · ` : ""}Show how it got there</summary>
                  {measured && (
                    <div className="sources">
                      <h3 className="lbl">How much came from each AI</h3>
                      <div className="md"><Markdown text={measured} /></div>
                    </div>
                  )}
                  {sources && (
                    <div className="sources">
                      <h3 className="lbl">What it took from each AI</h3>
                      <div className="md"><Markdown text={sources} /></div>
                    </div>
                  )}
                  <div className="md"><Markdown text={rest} /></div>
                </details>
              </>
            );
          })()}
        </section>
      )}
      {canJudge && !verdict && (
        <button className="primary wide" onClick={() => judge(done, (brief || idea).trim(), runId ?? uid())}>Get the top answer</button>
      )}

      {/* Once there's a verdict, the individual answers step back behind one button. */}
      {Object.keys(results).length > 0 && verdict && !judging && (
        <button className="ghost wide answerstoggle" aria-expanded={showAnswers} onClick={() => setShowAnswers((v) => !v)}>
          {showAnswers ? "Hide" : "Show"} each AI's own answer{failedCount > 0 ? ` (${failedCount} failed)` : ""}
        </button>
      )}

      {rounds.length > 0 && Object.keys(results).length > 0 && <h2 className="lbl roundnow">Try {rounds.length + 1}</h2>}
      {Object.keys(results).length > 0 && (!verdict || judging || showAnswers) && (
        <section className={`grid n${Object.keys(results).length}`}>
          {Object.entries(results).map(([pid, r]) => (
            <article key={pid} className="card" aria-busy={r === "loading"}>
              <div className="cardhead">
                <h3 className="cardname"><Logo id={pid as ProviderId} />{label(pid as ProviderId)}</h3>
                {r !== "loading" && (r.model || r.ms > 0) && <small>{[r.model, r.ms > 0 && `${(r.ms / 1000).toFixed(1)}s`].filter(Boolean).join(" · ")}</small>}
                {r !== "loading" && r.promptOnly && <span className="tag">prompt</span>}
                {r !== "loading" && r.text && <CopyBtn text={r.text} label={r.promptOnly ? "Copy prompt" : "Copy"} />}
              </div>
              {r === "loading" ? <Skeleton />
                : r.error ? (
                  <div className="error carderr">
                    <span>{r.error}</span>
                    {runPrompt && <button className="ghost small" onClick={() => retry(pid as ProviderId)}>Try again</button>}
                  </div>
                )
                : (
                  <>
                    {r.images?.map((src, i) => (
                      <ResultImage key={i} src={src} name={`switchboard-${pid}-${i + 1}`} alt={`Image ${i + 1} from ${label(pid as ProviderId)}`} />
                    ))}
                    {!r.text && !r.images?.length && <p className="muted">Pictures aren't kept in history. Ask again to redraw.</p>}
                    {r.text && <div className="md"><Markdown text={r.text} /></div>}
                    {r.citations && r.citations.length > 0 && (
                      <ol className="cites">{r.citations.map((c, i) => <li key={i}><a href={c} target="_blank" rel="noreferrer">{c.replace(/^https?:\/\//, "").slice(0, 60)}</a></li>)}</ol>
                    )}
                  </>
                )}
            </article>
          ))}
        </section>
      )}

      {briefPanel && settled && briefPanel}

      {rounds.length > 0 && (
        <section className="rounds" aria-label="Earlier rounds">
          <h2 className="lbl">Earlier tries</h2>
          {[...rounds].reverse().map((r) => (
            <details key={r.n} className="round">
              <summary>Try {r.n} · {r.results.map((x) => label(x.provider)).join(", ")}</summary>
              <details className="roundbrief"><summary>What was asked</summary><p>{r.brief}</p></details>
              {r.verdict && <div className="best md"><Markdown text={bestAnswer(r.verdict)} /></div>}
              <div className={`grid n${r.results.length}`}>
                {r.results.map((x) => (
                  <article key={x.provider} className="card">
                    <div className="cardhead"><h3 className="cardname"><Logo id={x.provider} />{label(x.provider)}</h3></div>
                    {x.error ? <div className="error carderr"><span>{x.error}</span></div> : (
                      <>
                        {x.images?.map((src, i) => <ResultImage key={i} src={src} name={`switchboard-round${r.n}-${x.provider}-${i + 1}`} alt={`Round ${r.n} image from ${label(x.provider)}`} />)}
                        {x.text && <div className="md"><Markdown text={x.text} /></div>}
                      </>
                    )}
                  </article>
                ))}
              </div>
            </details>
          ))}
        </section>
      )}

      {providers.length > 0 && providers.every((p) => !p.configured) && (
        <div className="error" role="alert">No API keys found. Add them in Vercel → Settings → Environment Variables (see README), then redeploy.</div>
      )}

      {Object.keys(results).length === 0 && !brief && (
        <section className="howto">
          <div><b>1</b><span>Type a question</span></div>
          <div><b>2</b><span>It picks the right AIs</span></div>
          <div><b>3</b><span>Get the top answer</span></div>
        </section>
      )}

      {!revising && <div className="actionbar">
        <p className="nextstep" role="status">{nextStep}</p>
        <div className="actionrow">
        {done.length > 0 && !running && (
          <button className="ghost" aria-expanded={revising} onClick={() => { setRevising(true); setTimeout(() => document.querySelector(".revise")?.scrollIntoView({ behavior: scrollBehavior(), block: "start" }), 60); }}>Change something</button>
        )}
        {askAgain ? (
          <button className="primary" disabled={!sendable.length} onClick={askAgain.go}>{askAgain.label}</button>
        ) : finished ? (
          <button className="primary" onClick={startOver}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>New ask
          </button>
        ) : (
          <button className="primary" disabled={!idea.trim() || !anyAI || (showChoice && !sendable.length) || running || briefing || picking2} onClick={() => send()}>
            {picking2 ? "Picking…" : briefing ? "Improving…" : running ? `Asking… ${done.length} of ${Object.keys(results).length} back` : !showChoice || sendable.length ? `${askLabel} →` : "Pick at least one AI"}
          </button>
        )}
        </div>
      </div>}
    </main>
  );
}

// The verdict arrives as one markdown document. Pull out the answer to use, the note on where it
// came from, and leave the grading (everything else) for the fold-away section.
function section(v: string, title: string) {
  const m = new RegExp(`(^|\\n)##\\s*${title}\\s*\\n`, "i").exec(v);
  if (!m) return null;
  const start = m.index + m[0].length;
  const next = v.slice(start).search(/\n##\s/);
  const end = next < 0 ? v.length : start + next;
  return { from: m.index, to: end, text: v.slice(start, end).trim() };
}
function splitVerdict(v: string) {
  const b = section(v, "Best combined answer");
  const s = section(v, "Built from");
  const m = section(v, "Measured");
  const best = b ? b.text : v;
  let rest = b ? v : "";
  // Cut the later section first so the earlier one's positions stay valid.
  for (const part of [b, s, m].filter(Boolean).sort((x, y) => y!.from - x!.from)) rest = rest.slice(0, part!.from) + rest.slice(part!.to);
  rest = rest.trim();
  const rf = rest.match(/##\s*Red flags\s*([\s\S]*?)(?=\n##|$)/i);
  const flags = rf ? (rf[1].match(/^\s*[-*>]/gm) ?? []).filter((l) => l.trim().startsWith(">")).length || (/none found/i.test(rf[1]) ? 0 : (rf[1].match(/^\s*[-*]/gm) ?? []).length) : 0;
  return { best, rest, flags, sources: s?.text ?? "", measured: m?.text ?? "" };
}

function bestAnswer(v: string) {
  return splitVerdict(v).best;
}

// Logo chain: your own file in public/logos/<id>.svg or .png → the company's real icon by domain → monogram badge.
// The layout lists which files exist in public/logos at build time, so the page never asks for one that isn't there.
function logoSrc(id: ProviderId): string {
  const files = (document.documentElement.dataset.logos ?? "").split(",");
  const own = [`${id}.svg`, `${id}.png`].find((f) => files.includes(f));
  return own ? `/logos/${own}` : `https://www.google.com/s2/favicons?domain=${DOMAIN[id]}&sz=128`;
}

function Logo({ id }: { id: ProviderId }) {
  const [src, setSrc] = useState<string | null>(null); // null until the page is running in the browser
  const [ok, setOk] = useState(false);
  useEffect(() => { setSrc(logoSrc(id)); setOk(false); }, [id]);
  if (src === "") return <i className={`mono ${id}`}>{MONO[id]}</i>;
  if (src === null) return <span className="logo" aria-hidden="true" />;
  return <img className={`logo ${ok ? "ok" : ""}`} src={src} alt="" decoding="async" onLoad={() => setOk(true)} onError={() => setSrc("")} />;
}

// Task-type icons, drawn in the same line style as the header icons. Keyed by preset id.
const PRESET_ICONS: Record<string, React.ReactNode> = {
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 9" /></>,
  copy: <><path d="M4 20l1-4L16 5l3 3L8 19l-4 1z" /><path d="M14 7l3 3" /></>,
  build: <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14" />,
  research: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  mortgage: <><path d="M4 11l8-7 8 7" /><path d="M6 10v9h12v-9" /><path d="M10 19v-5h4v5" /></>,
  all: <path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z" />,
};
function PresetIcon({ id }: { id: string }) {
  const shape = PRESET_ICONS[id];
  if (!shape) return null;
  return <svg className="chipicon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{shape}</svg>;
}

// One quiet line saying whether this device is in step with the others.
function SyncLine({ status, onRetry }: { status: import("./useSync").SyncStatus; onRetry: () => void }) {
  if (status.state === "failed") {
    return (
      <div className="syncline" role="status">
        <span>Not synced. {status.reason} Your work is saved on this device and will sync when it can.</span>
        <button className="ghost small" onClick={onRetry}>Sync now</button>
      </div>
    );
  }
  const text =
    status.state === "off" ? "Sync is off. Runs and projects are saved on this device only."
    : status.state === "synced" ? `Synced across your devices at ${new Date(status.at).toLocaleTimeString(undefined, { timeStyle: "short" })}`
    : "Syncing…";
  return <div className="syncline" role="status"><span>{text}</span></div>;
}

// A generated image, with a way to keep it.
// A plain download link does nothing inside a home-screen app on iPhone, so saving goes through the
// phone's share sheet ("Save Image") where there is one, and falls back to a normal download elsewhere.
function ResultImage({ src, name, alt }: { src: string; name: string; alt: string }) {
  const file = useRef<File | null>(null);
  const [note, setNote] = useState("");
  // Get the file ready ahead of the tap: the share sheet only opens if it's asked for straight away.
  useEffect(() => {
    let live = true;
    file.current = null;
    fetch(src).then((r) => r.blob()).then((b) => {
      if (!live) return;
      const type = b.type && b.type.startsWith("image/") ? b.type : "image/png";
      file.current = new File([b], `${name}.${type.split("/")[1].replace("jpeg", "jpg").replace("svg+xml", "svg")}`, { type });
    }).catch(() => { /* a hosted image that can't be fetched: the button opens it instead */ });
    return () => { live = false; };
  }, [src, name]);

  async function keep() {
    setNote("");
    const f = file.current;
    try {
      if (f && navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f] }); return; }
      if (f) {
        const url = URL.createObjectURL(f);
        const a = document.createElement("a");
        a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setNote("Saved to your downloads.");
        return;
      }
      window.open(src, "_blank", "noopener");
      setNote("Opened in a new tab. Save it from there.");
    } catch (e: any) {
      if (e?.name === "AbortError") return; // closed the share sheet without choosing
      setNote("Couldn't save it. Press and hold the image, then choose Save.");
    }
  }

  return (
    <figure className="imgwrap">
      <img src={src} decoding="async" alt={alt} onClick={keep} />
      <figcaption>
        <button className="ghost small" onClick={keep}>Save image</button>
        <span role="status">{note || "Or press and hold the image."}</span>
      </figcaption>
    </figure>
  );
}

// A chosen photo, shrunk so a few of them still make a small request.
async function shrinkFile(file: File, max = 1024): Promise<string | null> {
  // Decode through an <img> so iPhone camera photos (HEIC, rotated) come out right.
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    if (w < 8 || h < 8) return null;
    const scale = Math.min(1, max / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// The Switchboard mark: three sources feeding one point.
function Mark({ size }: { size: number }) {
  return (
    <svg className="markimg" viewBox="20 18 140 140" width={size} height={size} aria-hidden="true">
      <defs>
        <clipPath id="mk1"><circle cx="44" cy="46" r="17" /></clipPath><clipPath id="mk2"><circle cx="90" cy="38" r="17" /></clipPath><clipPath id="mk3"><circle cx="136" cy="46" r="17" /></clipPath>
      </defs>
      <g fill="none" strokeWidth="8" strokeLinecap="round"><path d="M44 63 V78 C44 96 60 96 78 96 H90" stroke="#62b6b3" /><path d="M90 55 V96" stroke="#ffb27f" /><path d="M136 63 V78 C136 96 120 96 102 96 H90" stroke="#7fb0d8" /></g>
      <image href="/logos/openai.png" x="27" y="29" width="34" height="34" clipPath="url(#mk1)" />
      <image href="/logos/anthropic.png" x="73" y="21" width="34" height="34" clipPath="url(#mk2)" />
      <image href="/logos/xai.png" x="119" y="29" width="34" height="34" clipPath="url(#mk3)" />
      <g fill="none" strokeWidth="5"><circle cx="44" cy="46" r="19" stroke="#62b6b3" /><circle cx="90" cy="38" r="19" stroke="#ffb27f" /><circle cx="136" cy="46" r="19" stroke="#7fb0d8" /></g>
      <circle cx="90" cy="104" r="20" fill="var(--panel)" /><circle cx="90" cy="104" r="16" fill="var(--accent2)" />
      <path d="M90 126 V150 M76 138 L90 152 L104 138" fill="none" stroke="var(--accent2)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Three grey lines standing in for text that's on its way.
function Skeleton() {
  return <div className="skeleton" aria-hidden="true"><span /><span /><span /></div>;
}

// A destructive action asks once, in place, instead of through a browser pop-up.
function ConfirmButton({ label, question, yes, no, danger, onYes }: { label: string; question: string; yes: string; no: string; danger?: boolean; onYes: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <button className={`ghost small ${danger ? "danger" : ""}`} onClick={() => setAsking(true)}>{label}</button>;
  return (
    <div className="confirm" role="group" aria-label={question} onKeyDown={(e) => { if (e.key === "Escape") setAsking(false); }}>
      <span>{question}</span>
      <button className="ghost small danger" onClick={() => { setAsking(false); onYes(); }}>{yes}</button>
      <button className="ghost small" autoFocus onClick={() => setAsking(false)}>{no}</button>
    </div>
  );
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState("");
  return (
    <button className="ghost small" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setOk("Copied"); } catch { setOk("Copy failed"); }
      setTimeout(() => setOk(""), 1600);
    }}><span aria-live="polite">{ok || label}</span></button>
  );
}
