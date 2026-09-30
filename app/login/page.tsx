"use client";
import { useState } from "react";

export default function Login() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
      if (r.ok) { window.location.href = "/"; return; }
      setErr(
        r.status === 401 ? "Wrong password. Try again."
        : r.status === 429 || r.status === 403 ? "Too many attempts. Wait a minute, then try again."
        : `Couldn't sign in (error ${r.status}). Try again in a moment.`,
      );
    } catch {
      setErr(navigator.onLine === false ? "You're offline. Reconnect and try again." : "Couldn't reach Switchboard. Check your connection and try again.");
    }
    setBusy(false);
  }
  return (
    <main className="login">
      <form onSubmit={go} className="panel">
        <div className="mark" aria-hidden="true">
          <svg viewBox="20 18 140 140" width="128" height="128">
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
        </div>
        <h1 className="brand">Switchboard<span>ask once · get the top answer</span></h1>
        <label className="sr" htmlFor="pw">Password</label>
        <input id="pw" type="password" aria-invalid={!!err} aria-describedby={err ? "pwerr" : undefined} autoFocus placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        {err && <div id="pwerr" className="error" role="alert">{err}</div>}
        <button className="primary" disabled={!pw || busy}>{busy ? "Signing in…" : "Enter"}</button>
      </form>
    </main>
  );
}
