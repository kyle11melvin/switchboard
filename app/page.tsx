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
  const [newName, setNewName] = useState("");

  const [idea, setIdea] = useState("");
  const [preset, setPreset] = useState<Preset>(PRESETS[1]);
  const [mode, setMode] = useState<Mode>(PRESETS[1].mode);
  const [selected, setSelected] = useState<ProviderId[]>(PRESETS[1].models);
  const [autoJudge, setAutoJudge] = useState(true);
  const [imgStyle, setImgStyle] = useState("auto");
  const [presetLocked, setPresetLocked] = useState(false); // true once the person picks a preset by hand
  const [predicted, setPredicted] = useState<string | null>(null);
  const [judgeWith, setJudgeWith] = useState<ProviderId>("anthropic");

  const [brief, setBrief] = useState("");
  const [briefing, setBriefing] = useState(false);
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
  const noteFor = [preset.note, styleNote].filter(Boolean).join("\n\n") || undefined;
  const byId = useMemo(() => Object.fromEntries(providers.map((p) => [p.id, p])), [providers]);
  const label = (id: ProviderId) => byId[id]?.label ?? id;

  function applyPreset(p: Preset) {
    setPreset(p); setMode(p.mode); setSelected(p.models); setAutoJudge(p.judge);
  }
  function pickPreset(p: Preset) { setPresetLocked(true); applyPreset(p); }
  useEffect(() => { if (!idea.trim()) setPresetLocked(false); }, [idea]);
  function onIdeaChange(v: string) {
    setIdea(v);
    const id = predictPreset(v);
    setPredicted(id);
    if (!presetLocked && id && id !== preset.id) {
      const p = PRESETS.find((x) => x.id === id);
      if (p) applyPreset(p);
    }
  }
  function toggle(id: ProviderId) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
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

  async function sharpen() {
    if (briefing || !idea.trim()) return;
    setErr(""); setBriefing(true);
    try {
      const d = await api<{ brief?: string; error?: string }>("/api/brief", { idea, mode, project: projectCtx, presetNote: noteFor, brain });
      if (d.error) throw new Error(d.error);
      if (!d.brief) throw new Error("The brief came back empty. Try again.");
      setBrief(d.brief); setBriefOpen(true);
    } catch (e: any) { setErr(`Sharpen failed: ${e.message}`); } finally { setBriefing(false); }
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
      setVerdict(v); setAnnounce("Verdict ready.");
    } catch (e: any) { if (activeRun.current === id) setErr(`Judge failed: ${e.message} Tap "Judge these answers" to try again.`); } finally { setJudging(false); }
  }

  async function runOne(provider: ProviderId, prompt: string, id: string): Promise<RunResult> {
    let res: RunResult;
    try {
      const d = await api<Partial<RunResult>>("/api/run", { provider, mode, prompt, project: projectCtx, presetNote: noteFor });
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

  async function send() {
    const prompt = (brief || idea).trim();
    const targets = selected.filter((s) => byId[s]?.configured);
    // Cmd+Enter lands here too, so guard against a second run while one is in flight.
    if (!prompt || !targets.length || running) return;
    setErr(""); setVerdict(""); setBriefOpen(false); setShowAnswers(false);
    const id = uid(); setRunId(id); setRunPrompt(prompt); activeRun.current = id;
    setAnnounce(`Sent to ${targets.map(label).join(", ")}.`);
    setResults(Object.fromEntries(targets.map((s) => [s, "loading" as const])));
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" }), 50);

    const finished = await Promise.all(targets.map((provider) => runOne(provider, prompt, id)));

    const now = Date.now();
    const item: HistoryItem = {
      id, at: now, updatedAt: now, idea, brief: prompt, mode, projectName: projectCtx?.name,
      // Images are big; keep history light by storing text only.
      results: finished.map((r) => ({ ...r, images: undefined })),
    };
    setHistory((h) => saveHistory([item, ...h].slice(0, HISTORY_LIMIT)));
    sync.syncSoon();

    if (activeRun.current === id && mode === "text" && autoJudge && finished.filter((r) => r.text && !r.error).length >= 2) {
      judge(finished, prompt, id);
    }
  }

  function openHistory(h: HistoryItem) {
    setIdea(h.idea); setBrief(h.brief === h.idea ? "" : h.brief); setMode(h.mode);
    setResults(Object.fromEntries(h.results.map((r) => [r.provider, r])));
    setVerdict(h.verdict ?? ""); setRunId(h.id); setRunPrompt(h.brief); activeRun.current = h.id; setErr(""); setShowHistory(false); setBriefOpen(false); setShowAnswers(false);
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  }

  const sendable = selected.filter((s) => byId[s]?.configured);
  const done = Object.values(results).filter((r) => r !== "loading") as RunResult[];
  const running = Object.values(results).some((r) => r === "loading");
  const failedCount = done.filter((r) => r.error).length;
  const verdictParts = useMemo(() => splitVerdict(verdict), [verdict]);
  const canJudge = mode === "text" && done.filter((r) => r.text && !r.error).length >= 2 && !running && !judging;

  return (
    <main>
      <header className="top">
        <h1 className="brand">Switchboard<span>one idea · every AI · one verdict</span></h1>
        <div className="topright">
          <select className="projpill" aria-label="Project" value={projectId} onChange={(e) => { const v = e.target.value; if (v === "__new") { setNaming(true); } else { setNaming(false); chooseProject(v); setEditingProject(false); } }}>
            {shownProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="__new">+ New project…</option>
          </select>
          {Object.keys(results).length > 0 && (
            <button className="iconbtn" aria-label="New idea" title="New idea" onClick={() => { activeRun.current = null; setRunId(null); setRunPrompt(""); setErr(""); setResults({}); setVerdict(""); setBrief(""); setIdea(""); setPresetLocked(false); window.scrollTo({ top: 0, behavior: scrollBehavior() }); }}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          )}
          <button className="iconbtn" aria-label={history.length ? `History, ${history.length} run${history.length === 1 ? "" : "s"}` : "History"} aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            {history.length > 0 && <span className="badge" aria-hidden="true">{history.length}</span>}
          </button>
        </div>
      </header>

      {showHistory && (
        <section className="panel" aria-label="History">
          <SyncLine status={sync.status} onRetry={sync.syncNow} />
          {history.length === 0 && <p className="muted">No runs yet.</p>}
          {(showAllHistory ? history : history.slice(0, HISTORY_PAGE)).map((h) => (
            <button key={h.id} className="hist" onClick={() => openHistory(h)}>
              <span>{h.idea.trim().slice(0, 90) || h.brief.trim().slice(0, 90) || "Untitled run"}</span>
              <small>{new Date(h.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · {h.results.map((r) => label(r.provider)).join(", ")}{h.verdict ? " · judged" : ""}{h.projectName ? ` · ${h.projectName}` : ""}</small>
            </button>
          ))}
          {history.length > HISTORY_PAGE && !showAllHistory && (
            <button className="ghost small showall" onClick={() => setShowAllHistory(true)}>Show all {history.length} runs</button>
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
            <span>{project.locked.trim() ? (() => { const c = project.locked.split("\n").filter((l) => l.trim()).length; return `${c} locked decision${c === 1 ? " rides" : "s ride"} along with every prompt`; })() : "No locked decisions yet — tap to add"}</span>
            <span className="chev">{editingProject ? "Done" : "Edit"}</span>
          </button>
          {editingProject && (
            <div className="lockeditor">
              <textarea rows={6} value={project.locked} aria-label={`Locked decisions for ${project.name}, one per line`}
                placeholder={"One per line. Every model and the judge treat these as settled.\ne.g. Single-file HTML, no framework\ne.g. Brand colors navy #1B2A4A / gold #C9A84C"}
                onChange={(e) => updateProjects(projects.map((p) => (p.id === project.id ? { ...p, locked: e.target.value, updatedAt: Date.now() } : p)))} />
              <ConfirmButton danger label="Delete project" question={`Delete “${project.name}” and its locked decisions?`} yes="Delete" no="Keep"
                onYes={() => {
                  // Leave a marker instead of removing it, so your other devices delete it too.
                  updateProjects(projects.map((p) => (p.id === project.id ? { ...p, locked: "", deleted: true, updatedAt: Date.now() } : p)));
                  chooseProject("none"); setEditingProject(false);
                }} />
            </div>
          )}
        </section>
      )}

      {/* Idea */}
      <section className="panel idea">
        <div className="row"><label className="lbl" htmlFor="idea">Idea</label><span className="modepill">{mode === "image" ? "Image" : "Text"}</span></div>
        <textarea id="idea" rows={4} value={idea} onChange={(e) => onIdeaChange(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); send(); } }}
          placeholder="Dump the rough idea. Sharpen it into a brief, or send it straight out." />

        <div className="chips" role="group" aria-label="Task type">
          {PRESETS.map((p) => (
            <button key={p.id} aria-pressed={preset.id === p.id} className={`chip ${preset.id === p.id ? "on" : ""}`} onClick={() => pickPreset(p)}><PresetIcon id={p.id} />{p.label}{!presetLocked && predicted === p.id && preset.id === p.id && <small className="auto"> · auto</small>}</button>
          ))}
        </div>

        {mode === "image" && !selected.some((s) => byId[s]?.configured && byId[s]?.canImage) && (
          <p className="hint">No image-capable key yet (ChatGPT or Grok). The models below will write you a ready-to-paste image prompt instead.</p>
        )}
        {mode === "image" && (
          <div className="chips styles" role="group" aria-label="Image style">
            {IMAGE_STYLES.map((st) => (
              <button key={st.id} aria-pressed={imgStyle === st.id} className={`chip sm ${imgStyle === st.id ? "on" : ""}`} onClick={() => setImgStyle(st.id)}>{st.label}</button>
            ))}
          </div>
        )}
        <div className="chips models" role="group" aria-label="AIs to send to">
          {providers.map((p) => {
            const disabled = !p.configured;
            const why = !p.configured ? "no key" : mode === "image" && !p.canImage ? "prompt only" : "";
            return (
              <button key={p.id} disabled={disabled} aria-pressed={selected.includes(p.id) && !disabled}
                className={`chip model ${p.id} ${selected.includes(p.id) && !disabled ? "on" : ""}`}
                onClick={() => toggle(p.id)} title={p.model}>
                <Logo id={p.id} />{p.label}{why && <small> · {why}</small>}
              </button>
            );
          })}
        </div>
        {mode === "text" && (
          <div className="row judgeRow">
            <label className="switch"><input type="checkbox" checked={autoJudge} onChange={(e) => setAutoJudge(e.target.checked)} /><span className="track"><span className="knob" /></span> Auto-judge</label>
            <select className="inline" aria-label="Judge model" value={judgeWith} onChange={(e) => setJudgeWith(e.target.value as ProviderId)}>
              {providers.filter((p) => p.configured).map((p) => <option key={p.id} value={p.id}>by {p.label}</option>)}
            </select>
          </div>
        )}
      </section>

      {brief && (
        <section className="panel briefpanel">
          <div className="row briefhead">
            <button className="brieftoggle" aria-expanded={briefOpen} aria-controls="brief" onClick={() => setBriefOpen((v) => !v)}>
              <span className="lbl">{briefOpen ? "Brief · this is what gets sent" : "Brief · tap to open"}</span>
            </button>
            <button className="ghost small" onClick={() => setBrief("")}>Discard</button>
          </div>
          {briefOpen && <textarea id="brief" rows={10} aria-label="Brief" value={brief} onChange={(e) => setBrief(e.target.value)} />}
        </section>
      )}

      {err && <div className="error" role="alert">{err}</div>}
      <div className="sr" role="status" aria-live="polite">{announce}</div>

      <div ref={resultsRef} className="anchor" />

      {/* Verdict first — it's the thing you actually use */}
      {(judging || verdict) && (
        <section className="panel verdict" aria-busy={judging}>
          <div className="row">
            <h2 className="lbl">Verdict {judging ? "" : `· judged blind by ${label(judgeWith)}`}</h2>
            {verdict && <CopyBtn text={bestAnswer(verdict)} label="Copy" />}
          </div>
          {judging ? <Skeleton /> : (() => {
            const { best, rest, flags, sources, measured } = verdictParts;
            return (
              <>
                <div className="best md"><Markdown text={best} /></div>
                {/* The answer is the point. How it was reached stays folded until asked for. */}
                <details className="grading">
                  <summary>{flags > 0 ? `${flags} red flag${flags === 1 ? "" : "s"} caught · ` : ""}How this was judged</summary>
                  {measured && (
                    <div className="sources">
                      <h3 className="lbl">Where the wording came from</h3>
                      <div className="md"><Markdown text={measured} /></div>
                    </div>
                  )}
                  {sources && (
                    <div className="sources">
                      <h3 className="lbl">What the judge says it used</h3>
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
        <button className="primary wide" onClick={() => judge(done, (brief || idea).trim(), runId ?? uid())}>Judge these answers</button>
      )}

      {/* Once there's a verdict, the individual answers step back behind one button. */}
      {Object.keys(results).length > 0 && verdict && !judging && (
        <button className="ghost wide answerstoggle" aria-expanded={showAnswers} onClick={() => setShowAnswers((v) => !v)}>
          {showAnswers ? "Hide" : "Show"} the {done.length} individual answer{done.length === 1 ? "" : "s"}{failedCount > 0 ? ` (${failedCount} failed)` : ""}
        </button>
      )}

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
                    {!r.text && !r.images?.length && <p className="muted">Images aren't kept in history. Send it again to redraw.</p>}
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

      {providers.length > 0 && providers.every((p) => !p.configured) && (
        <div className="error" role="alert">No API keys found. Add them in Vercel → Settings → Environment Variables (see README), then redeploy.</div>
      )}

      {Object.keys(results).length === 0 && !brief && (
        <section className="howto">
          <div><b>1</b><span>Drop a rough idea</span></div>
          <div><b>2</b><span>Sharpen it into a brief</span></div>
          <div><b>3</b><span>Every AI answers, one judges</span></div>
        </section>
      )}

      <div className="actionbar">
        <button className="ghost" disabled={!idea.trim() || briefing} onClick={sharpen}>
          {briefing ? "Sharpening…" : brief ? "Re-sharpen" : "Sharpen"}
        </button>
        <button className="primary" disabled={!(brief || idea).trim() || !sendable.length || running} onClick={send}>
          {running ? `Running… ${done.length} of ${Object.keys(results).length} in` : sendable.length ? (sendable.length > 2 ? `Send to ${sendable.length} AIs` : `Send to ${sendable.map(label).join(" + ")}`) : "Pick at least one AI"}
        </button>
      </div>
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
