"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PRESETS, type Preset } from "@/lib/presets";
import { predictPreset } from "@/lib/predict";

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

const DOMAIN: Record<ProviderId, string> = { openai: "openai.com", anthropic: "anthropic.com", xai: "x.ai", perplexity: "perplexity.ai", gemini: "gemini.google.com" };
const MONO: Record<ProviderId, string> = { openai: "C", anthropic: "A", xai: "X", perplexity: "P", gemini: "G" };

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
  const [presetLocked, setPresetLocked] = useState(false); // true once the person picks a preset by hand
  const [predicted, setPredicted] = useState<string | null>(null);
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

  const sendable = selected.filter((s) => byId[s]?.configured && (mode === "text" || byId[s]?.canImage));
  const done = Object.values(results).filter((r) => r !== "loading") as RunResult[];
  const running = Object.values(results).some((r) => r === "loading");
  const canJudge = mode === "text" && done.filter((r) => r.text && !r.error).length >= 2 && !running && !judging;

  return (
    <main>
      <header className="top">
        <div className="brand">Switchboard<span>one idea · every AI · one verdict</span></div>
        <div className="topright">
          <select className="projpill" value={projectId} onChange={(e) => { const v = e.target.value; if (v === "__new") { const name = prompt("Project name?"); if (!name) return; const np = { id: uid(), name, locked: "" }; updateProjects([...projects, np]); chooseProject(np.id); setEditingProject(true); } else { chooseProject(v); setEditingProject(false); } }}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="__new">+ New project…</option>
          </select>
          <button className="iconbtn" aria-label="History" onClick={() => setShowHistory((v) => !v)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            {history.length > 0 && <span className="badge">{history.length}</span>}
          </button>
        </div>
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

      {project?.id !== "none" && (
        <section className="lockbar">
          <button className="lockline" onClick={() => setEditingProject((v) => !v)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
            <span>{project.locked.trim() ? `${project.locked.split("\n").filter((l) => l.trim()).length} locked decisions ride along with every prompt` : "No locked decisions yet — tap to add"}</span>
            <span className="chev">{editingProject ? "Done" : "Edit"}</span>
          </button>
          {editingProject && (
            <div className="lockeditor">
              <textarea rows={6} value={project.locked}
                placeholder={"One per line. Every model and the judge treat these as settled.\ne.g. Single-file HTML, no framework\ne.g. Brand colors navy #1B2A4A / gold #C9A84C"}
                onChange={(e) => updateProjects(projects.map((p) => (p.id === project.id ? { ...p, locked: e.target.value } : p)))} />
              <button className="ghost small danger" onClick={() => {
                if (!confirm(`Delete project "${project.name}"?`)) return;
                updateProjects(projects.filter((p) => p.id !== project.id)); chooseProject("none"); setEditingProject(false);
              }}>Delete project</button>
            </div>
          )}
        </section>
      )}

      {/* Idea */}
      <section className="panel idea">
        <div className="row"><label className="lbl" htmlFor="idea">Idea</label><span className="modepill">{mode === "image" ? "Image" : "Text"}</span></div>
        <textarea id="idea" rows={4} value={idea} onChange={(e) => onIdeaChange(e.target.value)}
          placeholder="Dump the rough idea. Sharpen it into a brief, or send it straight out." />

        <div className="chips">
          {PRESETS.map((p) => (
            <button key={p.id} className={`chip ${preset.id === p.id ? "on" : ""}`} onClick={() => pickPreset(p)}>{p.label}{!presetLocked && predicted === p.id && preset.id === p.id && <small className="auto"> · auto</small>}</button>
          ))}
        </div>

        <div className="chips models">
          {providers.map((p) => {
            const disabled = !p.configured || (mode === "image" && !p.canImage);
            const why = !p.configured ? "no key" : mode === "image" && !p.canImage ? "no images" : "";
            return (
              <button key={p.id} disabled={disabled}
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
            <select className="inline" value={judgeWith} onChange={(e) => setJudgeWith(e.target.value as ProviderId)}>
              {providers.filter((p) => p.configured).map((p) => <option key={p.id} value={p.id}>by {p.label}</option>)}
            </select>
          </div>
        )}
      </section>

      {brief && (
        <section className="panel">
          <div className="row"><label className="lbl">Brief · edit freely, this is what gets sent</label>
            <button className="ghost small" onClick={() => setBrief("")}>Discard</button></div>
          <textarea rows={10} value={brief} onChange={(e) => setBrief(e.target.value)} />
        </section>
      )}

      {err && <div className="error">{err}</div>}

      {/* Verdict first — it's the thing you actually use */}
      {(judging || verdict) && (
        <section className="panel verdict">
          <div className="row">
            <label className="lbl">Verdict {judging ? "" : `· judged by ${label(judgeWith)}`}</label>
            {verdict && <CopyBtn text={bestAnswer(verdict)} label="Copy best answer" />}
          </div>
          {judging ? <p className="muted pulse">Grading every answer against the brief{projectCtx ? " and locked decisions" : ""}…</p>
            : <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm]}>{verdict}</ReactMarkdown></div>}
        </section>
      )}
      {canJudge && !verdict && (
        <button className="primary wide" onClick={() => judge(done, (brief || idea).trim(), runId ?? uid())}>Judge these answers</button>
      )}

      {Object.keys(results).length > 0 && (
        <section className={`grid n${Object.keys(results).length}`}>
          {Object.entries(results).map(([pid, r]) => (
            <article key={pid} className="card">
              <div className="cardhead">
                <strong><Logo id={pid as ProviderId} />{label(pid as ProviderId)}</strong>
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
          {running ? "Running…" : sendable.length ? `Send to ${sendable.map(label).join(" + ")}` : mode === "image" ? "Images need an OpenAI or xAI key" : "Pick at least one AI"}
        </button>
      </div>
    </main>
  );
}

function bestAnswer(v: string) {
  const i = v.search(/##\s*Best combined answer/i);
  return i >= 0 ? v.slice(i).replace(/##\s*Best combined answer\s*/i, "").trim() : v;
}

// Logo chain: your own file in public/logos/<id>.svg → the company's real icon by domain → monogram badge.
function Logo({ id }: { id: ProviderId }) {
  const chain = [`/logos/${id}.svg`, `/logos/${id}.png`, `https://www.google.com/s2/favicons?domain=${DOMAIN[id]}&sz=128`];
  const [i, setI] = useState(0);
  if (i >= chain.length) return <i className={`mono ${id}`}>{MONO[id]}</i>;
  return <img className="logo" src={chain[i]} alt="" onError={() => setI(i + 1)} />;
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="ghost small" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); } catch { /* ignore */ }
    }}>{ok ? "Copied ✓" : label}</button>
  );
}
