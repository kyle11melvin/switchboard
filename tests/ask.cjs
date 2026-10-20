// The app's endpoint, end to end against stand-in AIs: the gate, the event stream, the tags, the cost.
// Builds nothing: run `npm run build` first. Needs no browser and no keys.
const path = require("path");
const { spawn, execSync } = require("child_process");

const PORT = 3922;
const ROOT = path.join(__dirname, "..");
const BASE = `http://localhost:${PORT}`;
const TOKEN = "test-token";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function start() {
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env, OPENAI_API_KEY: "fake", ANTHROPIC_API_KEY: "fake", GEMINI_API_KEY: "fake", PERPLEXITY_API_KEY: "fake", XAI_API_KEY: "",
      APP_PASSWORD: "a-password", ASK_TOKEN: TOKEN, HOUSE_RULES: "HOUSE RULES: never say banana.", KV_REST_API_URL: "", KV_REST_API_TOKEN: "",
      NODE_OPTIONS: `--require ${path.join(__dirname, "fakeai.cjs")}`,
    },
  });
  server.stderr.on("data", (d) => process.stderr.write(d));
  for (let i = 0; i < 60; i++) {
    try { execSync(`curl -sf -o /dev/null ${BASE}/login`); return server; } catch { await sleep(500); }
  }
  server.kill(); throw new Error("Server didn't start. Did you run npm run build?");
}

async function askStream(body, headers = {}) {
  const res = await fetch(`${BASE}/api/ask`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}`, "x-device-id": "test-phone", ...headers }, body: JSON.stringify(body) });
  if (!res.ok) return { status: res.status, events: [], body: await res.json().catch(() => null) };
  const events = [];
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) events.push(JSON.parse(line)); }
  }
  return { status: res.status, events };
}

(async () => {
  const server = await start();
  try {
    // The gate
    const noAuth = await fetch(`${BASE}/api/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: "hi" }) });
    ok("no token: 401", noAuth.status === 401);
    const badAuth = await fetch(`${BASE}/api/ask`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer wrong" }, body: JSON.stringify({ question: "hi" }) });
    ok("wrong token: 401", badAuth.status === 401);
    const empty = await askStream({ question: "   " });
    ok("empty question: 400", empty.status === 400);

    // A research question on the standard plan
    const r = await askStream({ question: "I built an app. How do I turn it into a profitable business?", tier: "standard" });
    ok("streams 200", r.status === 200);
    const types = r.events.map((e) => e.type);
    ok("events in order", JSON.stringify(types.filter((t) => t !== "answer")) === JSON.stringify(["usage", "picked", "sharpened", "challenged", "answered", "done"]), types.join(" > "));
    const picked = r.events.find((e) => e.type === "picked");
    ok("picked research with its three AIs", picked && picked.job === "research" && picked.ais.length === 3 && picked.ais.map((a) => a.provider).sort().join() === "anthropic,gemini,perplexity", JSON.stringify(picked && picked.ais));
    ok("standard plan asks the standard models", picked && picked.ais.some((a) => a.model === "claude-sonnet-5-5") && picked.ais.some((a) => a.model === "perplexity/sonar"));
    const sharpened = r.events.find((e) => e.type === "sharpened");
    ok("question was sharpened", sharpened && /GOAL:/.test(sharpened.brief) && !sharpened.asWritten);
    const answers = r.events.filter((e) => e.type === "answer");
    ok("three answers, all done", answers.length === 3 && answers.every((a) => a.status === "done" && a.text), answers.map((a) => `${a.provider}:${a.status}`).join(","));
    ok("perplexity brought sources", answers.some((a) => a.provider === "perplexity" && a.citations && a.citations.length === 1));
    const ch = r.events.find((e) => e.type === "challenged");
    ok("one tag per AI", ch && ch.tags.length === 3 && ch.tags.every((t) => t.provider && t.label));
    ok("one weak point, with its quoted receipt", ch && ch.flags === 1 && ch.tags.some((t) => t.tag === "weak" && /profitable within six months/.test(t.reason || "")), JSON.stringify(ch && ch.tags));
    ok("a strong recommendation", ch && ch.tags.some((t) => t.tag === "strong"));
    ok("agree and split carry real names, not letters", ch && /validate demand/i.test(ch.agree) && !/Answer [A-C]/.test(ch.split) && /(Claude|Gemini|Perplexity)/.test(ch.split), ch && ch.split);
    const ans = r.events.find((e) => e.type === "answered");
    ok("top answer written by the brain", ans && /top answer/i.test(ans.best) && ans.provider === "anthropic" && ans.checked.length === 3);
    const done = r.events.find((e) => e.type === "done");
    ok("seven calls counted", done && done.cost.calls === 7, done && String(done.cost.calls));
    ok("cost is dollars, not zero", done && done.cost.usd > 0 && done.cost.usd < 0.2 && done.cost.unpriced.length === 0, done && JSON.stringify(done.cost));
    ok("usage event says the plan and what is left", r.events[0].type === "usage" && r.events[0].usage.cap === 60);

    // House rules stay with the web tool; the app's pipeline never sends them
    const fs = require("fs");
    const log = fs.readFileSync(process.env.FAKEAI_LOG, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    ok("house rules were not sent to the app's AIs", !log.some((c) => /banana/.test(JSON.stringify(c))));
    ok("gemini key travels in a header, not the URL", log.some((c) => c.who === "gemini" && c.keyInHeader));

    // Premium plan routes to the strongest models
    const p = await askStream({ question: "Write a caption for a photo of my dog at the beach", tier: "premium" });
    const pp = p.events.find((e) => e.type === "picked");
    ok("premium writing uses opus and gpt-5", pp && pp.job === "writing" && pp.ais.some((a) => a.model === "claude-opus-5-5") && pp.ais.some((a) => a.model === "gpt-5"), JSON.stringify(pp && pp.ais));
    ok("premium finished with a top answer", p.events.some((e) => e.type === "answered"));
  } finally {
    server.kill();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("Test crashed:", e); process.exit(1); });
