"use client";

import { useEffect, useRef, useState } from "react";

// A short conversation after the results are in: say what you'd change, and it becomes the next brief.

export interface Returned { name: string; text?: string; error?: string; images?: string[] }
interface Line { role: "you" | "them"; text: string } // "you" is Switchboard asking, "them" is the person answering

// Pictures go along so the reviser can see what you're describing, shrunk first so the request stays small.
async function shrink(src: string, max = 768): Promise<string | null> {
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  } catch {
    return null; // a picture that can't be read is described as missing, not fatal
  }
}

export default function Revise(props: {
  idea: string; brief: string; mode: "text" | "image"; results: Returned[];
  project: { name: string; locked: string } | null; brain: string;
  onBrief: (brief: string) => void; onClose: () => void;
}) {
  const [chat, setChat] = useState<Line[]>([{ role: "you", text: "What do you want changed?" }]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [chat, busy]);

  async function say() {
    const text = draft.trim();
    if (!text || busy) return;
    const next: Line[] = [...chat, { role: "them", text }];
    setChat(next); setDraft(""); setErr(""); setBusy(true);
    try {
      const results = await Promise.all(props.results.map(async (r) => ({
        name: r.name, text: r.text, error: r.error,
        image: r.images?.[0] ? (await shrink(r.images[0])) ?? undefined : undefined,
      })));
      let res: Response;
      try {
        res = await fetch("/api/revise", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ idea: props.idea, brief: props.brief, mode: props.mode, results, chat: next, project: props.project, brain: props.brain }),
        });
      } catch {
        throw new Error(navigator.onLine === false ? "You're offline. Reconnect and try again." : "Couldn't reach Switchboard. Check your connection and try again.");
      }
      if (res.status === 401) { window.location.href = "/login"; return; }
      const d = await res.json().catch(() => null);
      if (!d) throw new Error(res.status === 504 ? "Timed out. Try again." : "Got an unreadable reply. Try again.");
      if (d.error) throw new Error(d.error);
      if (d.question) { setChat([...next, { role: "you", text: d.question }]); box.current?.focus({ preventScroll: true }); return; }
      if (d.brief) { props.onBrief(d.brief); return; }
      throw new Error("Nothing came back. Try again.");
    } catch (e: any) {
      // Put their words back so nothing typed is lost.
      setChat(chat); setDraft(text);
      setErr(e?.message ?? "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const answered = chat.some((m) => m.role === "them");
  return (
    <section className="panel revise" aria-label="Change something">
      <div className="row">
        <h2 className="lbl">Change something</h2>
        <button className="ghost small" onClick={props.onClose}>Close</button>
      </div>
      <div className="talk" role="log" aria-live="polite">
        {chat.map((m, i) => (
          <p key={i} className={m.role === "you" ? "asks" : "says"}>
            <span className="sr">{m.role === "you" ? "Switchboard asks: " : "You said: "}</span>{m.text}
          </p>
        ))}
        {busy && <p className="asks thinking">{answered && chat[chat.length - 1].role === "them" ? "Reading the answers and rewriting your question. Then it asks again." : "Thinking…"}</p>}
        <div ref={end} />
      </div>
      {err && <div className="error" role="alert">{err}</div>}
      <label className="sr" htmlFor="revise-say">Your answer</label>
      <textarea id="revise-say" ref={box} rows={3} maxLength={4000} value={draft} disabled={busy}
        placeholder="Say it in plain words. For example: shorter, keep Grok's layout, fix the commas."
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void say(); } }} />
      <div className="row reviseactions">
        <span className="muted">Tap the microphone on your keyboard to speak instead of type.</span>
        <button className="primary small" disabled={!draft.trim() || busy} onClick={say}>{busy ? "Working…" : answered ? "Send" : "Make the change and ask again"}</button>
      </div>
    </section>
  );
}
