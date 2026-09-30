"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_SLIDES, THEMES, fillIn, type Identity, type Slide, type SlideKind } from "@/lib/slides";

// Lays a carousel out as pictures, from copy that's already written.
// The words are set as real type, so they're spelled exactly as written and every slide matches.

const WHO_KEY = "sb.identity";
const LOOK_KEY = "sb.slideTheme";
const BLANK: Identity = { name: "", company: "", nmls: "", phone: "" };
const KINDS: { id: SlideKind; label: string }[] = [{ id: "cover", label: "Cover" }, { id: "point", label: "Point" }, { id: "cta", label: "Closing" }];

interface Drawn { url: string; file: File }

function savedWho(): Identity {
  try {
    const w = JSON.parse(localStorage.getItem(WHO_KEY) || "null");
    if (w && typeof w === "object") return { name: String(w.name ?? ""), company: String(w.company ?? ""), nmls: String(w.nmls ?? ""), phone: String(w.phone ?? "") };
  } catch { /* first use, or storage blocked */ }
  return BLANK;
}
function savedLook(): string {
  try { const l = localStorage.getItem(LOOK_KEY); if (l && THEMES.some((t) => t.id === l)) return l; } catch { /* fine */ }
  return THEMES[0].id;
}

export default function Carousel({ slides: given, caption, onClose }: { slides: Slide[]; caption: string; onClose: () => void }) {
  // This panel only ever runs in the browser, so saved details can be read before the first draw.
  const [slides, setSlides] = useState<Slide[]>(given);
  const [who, setWho] = useState<Identity>(savedWho);
  const [look, setLook] = useState(savedLook);
  const [at, setAt] = useState(0);
  const [drawn, setDrawn] = useState<Record<string, Drawn | "failed">>({});
  const [note, setNote] = useState("");
  const [whoOpen, setWhoOpen] = useState(() => { const w = savedWho(); return !(w.name || w.nmls); }); // open until your details have been saved once
  const asked = useRef(new Set<string>());
  const strip = useRef<HTMLDivElement>(null);

  const keepWho = (next: Identity) => { setWho(next); try { localStorage.setItem(WHO_KEY, JSON.stringify(next)); } catch { /* fine */ } };
  const keepLook = (id: string) => { setLook(id); try { localStorage.setItem(LOOK_KEY, id); } catch { /* fine */ } };

  // What each slide needs drawn. The same request always gives the same picture, so it doubles as the key.
  const jobs = useMemo(() => slides.map((s, i) => JSON.stringify({
    kind: s.kind, headline: fillIn(s.headline, who), body: fillIn(s.body, who), theme: look, index: i + 1, total: slides.length, ...who,
  })), [slides, who, look]);

  // Draw after a pause in typing, and only the slides that changed.
  useEffect(() => {
    const t = setTimeout(() => {
      jobs.forEach(async (job, i) => {
        if (asked.current.has(job)) return;
        asked.current.add(job);
        try {
          const r = await fetch("/api/slide", { method: "POST", headers: { "content-type": "application/json" }, body: job });
          if (r.status === 401) { window.location.href = "/login"; return; }
          if (!r.ok) throw new Error(String(r.status));
          const blob = await r.blob();
          const file = new File([blob], `slide-${String(i + 1).padStart(2, "0")}.png`, { type: "image/png" });
          setDrawn((d) => ({ ...d, [job]: { url: URL.createObjectURL(blob), file } }));
        } catch {
          asked.current.delete(job);
          setDrawn((d) => ({ ...d, [job]: "failed" }));
        }
      });
    }, 450);
    return () => clearTimeout(t);
  }, [jobs]);

  const edit = (patch: Partial<Slide>) => setSlides((all) => all.map((s, i) => (i === at ? { ...s, ...patch } : s)));
  const show = (i: number) => {
    setAt(i);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    strip.current?.children[i]?.scrollIntoView({ behavior: still ? "auto" : "smooth", inline: "center", block: "nearest" });
  };
  const add = () => { if (slides.length >= MAX_SLIDES) return; setSlides((all) => [...all.slice(0, at + 1), { kind: "point", headline: "", body: "" }, ...all.slice(at + 1)]); setAt(at + 1); };
  const remove = () => { if (slides.length <= 1) return; setSlides((all) => all.filter((_, i) => i !== at)); setAt(Math.max(0, at - 1)); };

  const files = jobs.map((j) => drawn[j]).filter((d): d is Drawn => !!d && d !== "failed").map((d) => d.file);
  const ready = files.length === slides.length && slides.every((s) => s.headline.trim() || s.body.trim());
  const blanks = /\[[^\]]{2,20}\]/.test(jobs.join(" "));

  async function save(list: File[]) {
    setNote("");
    try {
      if (navigator.canShare?.({ files: list })) { await navigator.share({ files: list }); return; }
      for (const f of list) {
        const url = URL.createObjectURL(f);
        const a = document.createElement("a");
        a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        await new Promise((r) => setTimeout(r, 250));
      }
      setNote(list.length === 1 ? "Saved to your downloads." : `${list.length} slides saved to your downloads.`);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setNote("Couldn't save. Press and hold a slide, then choose Save.");
    }
  }
  async function copyCaption() {
    try { await navigator.clipboard.writeText(fillIn(caption, who)); setNote("Caption copied."); } catch { setNote("Couldn't copy the caption."); }
  }

  const s = slides[at];
  const current = drawn[jobs[at]];
  return (
    <section className="panel carousel" aria-label="Carousel">
      <div className="row">
        <h2 className="lbl">Carousel · {slides.length} slide{slides.length === 1 ? "" : "s"}</h2>
        <button className="ghost small" onClick={onClose}>Close</button>
      </div>

      <div className="slidestrip" ref={strip} role="group" aria-label="Slides">
        {slides.map((sl, i) => {
          const d = drawn[jobs[i]];
          return (
            <button key={i} className={`slidethumb ${i === at ? "on" : ""}`} aria-pressed={i === at} aria-label={`Slide ${i + 1}: ${sl.headline || sl.body || "empty"}`} onClick={() => show(i)}>
              {d && d !== "failed" ? <img src={d.url} alt="" /> : <span className={`slidewait ${d === "failed" ? "bad" : ""}`}>{d === "failed" ? "Couldn't draw" : "Drawing…"}</span>}
            </button>
          );
        })}
      </div>

      <div className="slideedit">
        <div className="row">
          <span className="lbl">Slide {at + 1} of {slides.length}</span>
          <div className="chips kinds" role="group" aria-label="Slide type">
            {KINDS.map((k) => <button key={k.id} className={`chip sm ${s.kind === k.id ? "on" : ""}`} aria-pressed={s.kind === k.id} onClick={() => edit({ kind: k.id })}>{k.label}</button>)}
          </div>
        </div>
        <label className="fieldlbl" htmlFor="slidehead">Headline</label>
        <textarea id="slidehead" rows={2} maxLength={220} value={s.headline} onChange={(e) => edit({ headline: e.target.value })} />
        <label className="fieldlbl" htmlFor="slidebody">Text under it</label>
        <textarea id="slidebody" rows={3} maxLength={420} value={s.body} onChange={(e) => edit({ body: e.target.value })} placeholder="Optional" />
        <div className="row slideactions">
          <button className="ghost small" disabled={slides.length >= MAX_SLIDES} onClick={add}>Add a slide after this</button>
          <button className="ghost small danger" disabled={slides.length <= 1} onClick={remove}>Remove this slide</button>
          {current && current !== "failed" && <button className="ghost small" onClick={() => save([current.file])}>Save this slide</button>}
        </div>
      </div>

      <div className="lookrow">
        <span className="lbl">Look</span>
        <div className="chips" role="group" aria-label="Look">
          {THEMES.map((t) => <button key={t.id} className={`chip sm ${look === t.id ? "on" : ""}`} aria-pressed={look === t.id} onClick={() => keepLook(t.id)}>{t.label}</button>)}
        </div>
      </div>

      <details className="whoami" open={whoOpen} onToggle={(e) => setWhoOpen(e.currentTarget.open)}>
        <summary>Your details, shown at the bottom of every slide</summary>
        <div className="whogrid">
          {([["name", "Name", "name"], ["company", "Company", "organization"], ["nmls", "NMLS #", "off"], ["phone", "Phone", "tel"]] as const).map(([k, l, ac]) => (
            <div key={k}>
              <label className="fieldlbl" htmlFor={`who-${k}`}>{l}</label>
              <input id={`who-${k}`} value={who[k]} autoComplete={ac} inputMode={k === "phone" ? "tel" : k === "nmls" ? "numeric" : undefined} maxLength={60} onChange={(e) => keepWho({ ...who, [k]: e.target.value })} />
            </div>
          ))}
        </div>
        <p className="muted">Saved on this device. They also replace [Name], [Company], [Phone] and [NMLS #] in the copy.</p>
      </details>

      {blanks && <p className="hint">Some slides still show a placeholder in brackets. Fill in your details above, or edit the slide.</p>}

      <div className="row slidesave">
        <button className="primary" disabled={!ready} onClick={() => save(files)}>{ready ? `Save all ${slides.length} slides` : "Drawing slides…"}</button>
        {caption && <button className="ghost" onClick={copyCaption}>Copy caption</button>}
      </div>
      <p className="muted" role="status">{note || "Slides are 1080 × 1350, the tall Instagram size."}</p>
    </section>
  );
}
