"use client";
import { useState } from "react";

export default function Login() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    const r = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
    if (r.ok) window.location.href = "/"; else { setErr("Wrong password"); setBusy(false); }
  }
  return (
    <main className="login">
      <form onSubmit={go} className="panel">
        <div className="brand">Switchboard<span>one idea · every AI · one verdict</span></div>
        <input type="password" autoFocus placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        {err && <div className="error">{err}</div>}
        <button className="primary" disabled={!pw || busy}>{busy ? "…" : "Enter"}</button>
      </form>
    </main>
  );
}
