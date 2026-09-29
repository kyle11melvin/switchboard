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
      setErr(r.status === 401 ? "Wrong password. Try again." : `Couldn't sign in (error ${r.status}). Try again in a moment.`);
    } catch {
      setErr(navigator.onLine === false ? "You're offline. Reconnect and try again." : "Couldn't reach Switchboard. Check your connection and try again.");
    }
    setBusy(false);
  }
  return (
    <main className="login">
      <form onSubmit={go} className="panel">
        <h1 className="brand">Switchboard<span>one idea · every AI · one verdict</span></h1>
        <label className="sr" htmlFor="pw">Password</label>
        <input id="pw" type="password" aria-invalid={!!err} aria-describedby={err ? "pwerr" : undefined} autoFocus placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        {err && <div id="pwerr" className="error" role="alert">{err}</div>}
        <button className="primary" disabled={!pw || busy}>{busy ? "Signing in…" : "Enter"}</button>
      </form>
    </main>
  );
}
