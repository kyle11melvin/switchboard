"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PRESETS, type Preset } from "@/lib/presets";

type ProviderId = "openai" | "anthropic" | "xai" | "perplexity" | "gemini";
type Mode = "text" | "image";

interface ProviderInfo { id: ProviderId; label: string; configured: boolean; canImage: boolean; model: string }
interface RunResult { provider: ProviderId; model: string; text?: string; images?: string[]; citations?: string[]; error?: string; ms: number }
interface Project { id: string; name: string; locked: string }
interface HistoryItem {
  id: string; at: number; idea: string; brief: string; mode: Mode; projectName?: string;
  results: RunResult[]; verdict?: string;
}

const LS = { projects: "sb.projects", history: "sb.history", project: "sb.project" };
const load = <T,>(k: string, fallback: T): T => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } };
const uid = () => Math.random().toString(36).slice(2, 10);

const DEFAULT_PROJECTS: Project[] = [{ id: "none", name: "No project", locked: "" }];

export default function Home() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [brain, setBrain] = useState<ProviderId>("anthropic");
  const [projects, setProjects] = useState<Project[]>(DEFAULT_PROJECTS);
  const [projectId, setProjectId] = useState("none");
  const [editingProject, setEditingProject] = useState(false);

  const [idea, setIdea] = useState("");
  const [preset, setPreset] = useState<Preset>(PRESETS[1]);
  const [mode, setMode] = useState<Mode>(PRESETS[1].mode);
  const [selected, setSelected] = useState<ProviderId[]>(PRESETS[1].models);
  const [autoJudge, setAutoJudge] = useState(true);
  const [judgeWith, setJudgeWith] = useState<ProviderId>("anthropic");

  const [brief, setBrief] = useState("");
  const [briefing, setBriefing] = useState(false);
  const [results, setResults] = useState<Record<string, RunResult | "loading">>({});
  const [verdict, setVerdict] = useState("");
  const [judging, setJudging] = useState(false);
  const [err, setErr] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/status").then((r) => r.json()).then((d) => {
      setProviders(d.providers); setBrain(d.brain); setJudgeWith(d.brain);
    }).catch(() => setErr("Couldn't reach the server."));
    setProjects(load(LS.projects, DEFAULT_PROJECTS));
    setProjectId(load(LS.project, "none"));
    setHistory(load(LS.history, []));
  }, []);

  const project = projects.find((p) => p.id === projectId) ?? projects[0];
  const projectCtx = project && project.id !== "none" ? { name: project.name, locked: project.locked } : null;
  const byId = useMemo(() => Object.fromEntries(providers.map((p) => [p.id, p])), [providers]);
  const label = (id: ProviderId) => byId[id]?.label ?? id;

  function pickPreset(p: Preset) {
    setPreset(p); setMode(p.mode); setSelected(p.models); setAutoJudge(p.judge);
  }
  function toggle(id: ProviderId) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function updateProjects(next: Project[]) { setProjects(next); save(LS.projects, next); }
  function chooseProject(id: string) { setProjectId(id); save(LS.project, id); }

  async function sharpen() {
    setErr(""); setBriefing(true);
    try {
      const r = await fetch("/api/brief", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea, mode, project: projectCtx, presetNote: preset.note, brain }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setBrief(d.brief);
    } catch (e: any) { setErr(e.message); } finally { setBriefing(false); }
  }

  async function judge(finalResults: RunResult[], promptUsed: string, id: string) {
    const answers = finalResults.filter((r) => r.text && !r.error).map((r) => ({ label: `${label(r.provider)} (${r.model})`, text: r.text!, citations: r.citations }));
    if (answers.length < 1) return;
    setJudging(true); setVerdict("");
    try {
      const r = await fetch("/api/judge", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief: promptUsed, answers, project: projectCtx, judge: judgeWith }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setVerdict(d.verdict);
      setHistory((h) => { const n = h.map((x) => (x.id === id ? { ...x, verdict: d.verdict } : x)); save(LS.history, n); return n; });
    } catch (e: any) { setErr(`Judge failed: ${e.message}`); } finally { setJudging(false); }
  }

  async function send() {
    const prompt = (brief || idea).trim();
    const targets = selected.filter((s) => byId[s]?.configured && (mode === "text" || byId[s]?.canImage));
    if (!prompt || !targets.length) return;
    setErr(""); setVerdict("");
    const id = uid(); setRunId(id);
    setResults(Object.fromEntries(targets.map((s) => [s, "loading" as const])));

    const finished = await Promise.all(targets.map(async (provider) => {
      let res: RunResult;
      try {
        const r = await fetch("/api/run", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider, mode, prompt, project: projectCtx, presetNote: preset.note }),
        });
        res = await r.json();
      } catch (e: any) {
        res = { provider, model: "", error: e.message, ms: 0 };
      }
      setResults((prev) => ({ ...prev, [provider]: res }));
      return res;
    }));

    const item: HistoryItem = {
      id, at: Date.now(), idea, brief: prompt, mode, projectName: projectCtx?.name,
      // Images are big; keep history light by storing text only.
      results: finished.map((r) => ({ ...r, images: undefined })),
    };
    setHistory((h) => { const n = [item, ...h].slice(0, 40); save(LS.history, n); return n; });

    if (mode === "text" && autoJudge && finished.filter((r) => r.text && !r.error).length >= 2) {
      judge(finished, prompt, id);
    }
  }

  function openHistory(h: HistoryItem) {
    setIdea(h.idea); setBrief(h.brief === h.idea ? "" : h.brief); setMode(h.mode);
    setResults(Object.fromEntries(h.results.map((r) => [r.provider, r])));
    setVerdict(h.verdict ?? ""); setRunId(h.id); setShowHistory(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const done = Object.values(results).filter((r) => r !== "loading") as RunResult[];
  const running = Object.values(results).some((r) => r === "loading");
  const canJudge = mode === "text" && done.filter((r) => r.text && !r.error).length >= 2 && !running && !judging;

  return (
    <main>
      <header className="top">
        <div className="brand">Switchboard<span>one idea · every AI · one verdict</span></div>
        <button className="ghost" onClick={() => setShowHistory((v) => !v)}>History ({history.length})</button>
      </header>

      {showHistory && (
        <section className="panel">
          {history.length === 0 && <p className="muted">No runs yet.</p>}
          {history.map((h) => (
            <button key={h.id} className="hist" onClick={() => openHistory(h)}>
              <span>{h.idea.slice(0, 90) || h.brief.slice(0, 90)}</span>
              <small>{new Date(h.at).toLocaleString()} · {h.results.map((r) => label(r.provider)).join(", ")}{h.verdict ? " · judged" : ""}{h.projectName ? ` · ${h.projectName}` : ""}</small>
            </button>
          ))}
          {history.length > 0 && (
            <button className="ghost small" onClick={() => { if (confirm("Clear all history?")) { setHistory([]); save(LS.history, []); } }}>Clear history</button>
          )}
        </section>
      )}

      {/* Project + locked decisions */}
      <section className="panel">
        <div className="row">
          <label className="lbl">Project</label>
          <select value={projectId} onChange={(e) => chooseProject(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button className="ghost small" onClick={() => {
            const name = prompt("Project name?"); if (!name) return;
            const p = { id: uid(), name, locked: "" }; updateProjects([...projects, p]); chooseProject(p.id); setEditingProject(true);
          }}>+ New</button>
          {project?.id !== "none" && (
            <button className="ghost small" onClick={() => setEditingProject((v) => !v)}>{editingProject ? "Done" : "Locked decisions"}</button>
          )}
        </div>
        {project?.id !== "none" && !editingProject && project?.locked && (
          <p className="muted clamp">🔒 {project.locked.split("\n").filter(Boolean).length} locked decisions sent with every prompt</p>
        )}
        {editingProject && project && project.id !== "none" && (
          <>
            <textarea rows={6} value={project.locked}
              placeholder={"One per line. Every model and the judge treat these as settled.\ne.g. Single-file HTML, no framework\ne.g. Brand colors navy #1B2A4A / gold #C9A84C"}
              onChange={(e) => updateProjects(projects.map((p) => (p.id === project.id ? { ...p, locked: e.target.value } : p)))} />
            <button className="ghost small danger" onClick={() => {
              if (!confirm(`Delete project "${project.name}"?`)) return;
              updateProjects(projects.filter((p) => p.id !== project.id)); chooseProject("none"); setEditingProject(false);
            }}>Delete project</button>
          </>
        )}
      </section>

      {/* Idea */}
      <section className="panel">
        <label className="lbl">Idea</label>
        <textarea rows={4} value={idea} onChange={(e) => setIdea(e.target.value)}
          placeholder="Dump the rough idea. Sharpen it into a brief, or send it straight out." />

        <div className="chips">
          {PRESETS.map((p) => (
            <button key={p.id} className={`chip ${preset.id === p.id ? "on" : ""}`} onClick={() => pickPreset(p)}>{p.label}</button>
          ))}
        </div>

        <div className="chips models">
          {providers.map((p) => {
            const disabled = !p.configured || (mode === "image" && !p.canImage);
            const why = !p.configured ? "no key" : mode === "image" && !p.canImage ? "no images" : "";
            return (
              <button key={p.id} disabled={disabled}
                className={`chip model ${selected.includes(p.id) && !disabled ? "on" : ""}`}
                onClick={() => toggle(p.id)} title={p.model}>
                {p.label}{why && <small> · {why}</small>}
              </button>
            );
          })}
          <span className="modepill">{mode === "image" ? "Image mode" : "Text mode"}</span>
        </div>

        <div className="row actions">
          <button className="ghost" disabled={!idea.trim() || briefing} onClick={sharpen}>
            {briefing ? "Sharpening…" : brief ? "Re-sharpen" : "Sharpen into brief"}
          </button>
          <button className="primary" disabled={!(brief || idea).trim() || !selected.length || running} onClick={send}>
            {running ? "Running…" : `Send to ${selected.filter((s) => byId[s]?.configured).map(label).join(" + ") || "…"}`}
          </button>
        </div>
        {mode === "text" && (
          <div className="row judgeRow">
            <label><input type="checkbox" checked={autoJudge} onChange={(e) => setAutoJudge(e.target.checked)} /> Auto-judge</label>
            <span className="muted">with</span>
            <select value={judgeWith} onChange={(e) => setJudgeWith(e.target.value as ProviderId)}>
              {providers.filter((p) => p.configured).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        )}
      </section>

      {brief && (
        <section className="panel">
          <div className="row"><label className="lbl">Brief (edit freely — this is what gets sent)</label>
            <button className="ghost small" onClick={() => setBrief("")}>Discard</button></div>
          <textarea rows={10} value={brief} onChange={(e) => setBrief(e.target.value)} />
        </section>
      )}

      {err && <div className="error">{err}</div>}

      {/* Verdict first — it's the thing you actually use */}
      {(judging || verdict) && (
        <section className="panel verdict">
          <div className="row">
            <label className="lbl">⚖️ Verdict {judging ? "" : `· judged by ${label(judgeWith)}`}</label>
            {verdict && <CopyBtn text={bestAnswer(verdict)} label="Copy best answer" />}
          </div>
          {judging ? <p className="muted pulse">Grading every answer against the brief{projectCtx ? " and locked decisions" : ""}…</p>
            : <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{verdict}</ReactMarkdown></div>}
        </section>
      )}
      {canJudge && !verdict && (
        <button className="primary wide" onClick={() => judge(done, (brief || idea).trim(), runId ?? uid())}>⚖️ Judge these answers</button>
      )}

      {Object.keys(results).length > 0 && (
        <section className={`grid n${Object.keys(results).length}`}>
          {Object.entries(results).map(([pid, r]) => (
            <article key={pid} className="card">
              <div className="cardhead">
                <strong>{label(pid as ProviderId)}</strong>
                {r !== "loading" && <small>{r.model} · {(r.ms / 1000).toFixed(1)}s</small>}
                {r !== "loading" && r.text && <CopyBtn text={r.text} label="Copy" />}
              </div>
              {r === "loading" ? <p className="muted pulse">Thinking…</p>
                : r.error ? <p className="error">{r.error}</p>
                : (
                  <>
                    {r.images?.map((src, i) => (
                      <a key={i} href={src} download={`${pid}-${i + 1}.png`} className="imgwrap">
                        <img src={src} alt={`${label(pid as ProviderId)} image`} />
                        <span>Tap to download</span>
                      </a>
                    ))}
                    {r.text && <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{r.text}</ReactMarkdown></div>}
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
        <div className="error">No API keys found. Add them in Vercel → Settings → Environment Variables (see README), then redeploy.</div>
      )}
    </main>
  );
}

function bestAnswer(v: string) {
  const i = v.search(/##\s*Best combined answer/i);
  return i >= 0 ? v.slice(i).replace(/##\s*Best combined answer\s*/i, "").trim() : v;
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="ghost small" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); } catch { /* ignore */ }
    }}>{ok ? "Copied ✓" : label}</button>
  );
}
