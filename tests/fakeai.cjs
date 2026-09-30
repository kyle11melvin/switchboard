// Stand-in AIs for tests. Loaded with `node --require` before `next start`, it replaces
// global fetch so every provider call answers instantly and nothing costs money.
// Each call is appended to FAKEAI_LOG as one JSON line so tests can check what was sent.
const real = globalThis.fetch;
const fs = require("fs");
const LOG = process.env.FAKEAI_LOG || "";
const log = (o) => LOG && fs.appendFileSync(LOG, JSON.stringify(o) + "\n");

// A 10x10 PNG.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC";
const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });

// What each kind of text call gets back, told apart by the system prompt.
function reply(system, user) {
  if (/decide where a request goes/.test(system)) {
    // The pick step: a picture when there's a photo or a scene, research for questions, otherwise copy.
    const req = (/REQUEST:\n([\s\S]*?)(?:\n\n|$)/.exec(user) || [])[1] || "";
    const photo = /\d photos? (is|are) attached/.test(req);
    const job = photo || /\b(draw|picture|image|playing football)\b/i.test(req) ? "image" : /\b(best|what|how|which)\b/i.test(req) ? "research" : "copy";
    const ais = job === "image" ? ["openai", "xai"] : ["openai", "anthropic", "xai"];
    return JSON.stringify({ job, ais, why: job === "image" ? "It asks for a picture." : "It's words for people to read." });
  }
  if (/rough idea into a tight brief/.test(system)) return "GOAL: " + user.split("\n").slice(-1)[0].slice(0, 80) + "\nDELIVERABLE: one short answer.";
  if (/You are the gatekeeper/.test(system)) return "## Verdict\nAnswer B is best.\n\n## Scorecard\nA 7/10, B 9/10\n\n## Red flags\nNone.\n\n## Best parts\n- Answer A: the opening line.\n- Answer B: the numbers.";
  if (/write the final answer to a brief/.test(system)) return "## Best combined answer\nThe top answer, built from the best parts.\n\n## Built from\nAnswer B 60%, Answer A 40%";
  if (/revise a brief/.test(system)) return /shorter|keep/i.test(user) ? "BRIEF: A revised brief that keeps what you liked." : "QUESTION: Shorter, or a different angle?";
  return "A short answer to: " + user.slice(0, 60);
}

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  try {
    if (u.includes("api.openai.com/v1/images/edits")) {
      const f = opts.body; const imgs = f.getAll("image[]");
      log({ who: "openai-edits", prompt: f.get("prompt"), images: imgs.map((x) => x.type + ":" + x.size) });
      return json({ data: [{ b64_json: PNG }] });
    }
    if (u.includes("api.openai.com/v1/images/generations")) { log({ who: "openai-gen" }); return json({ data: [{ b64_json: PNG }] }); }
    if (u.includes("api.x.ai/v1/images/edits")) {
      const b = JSON.parse(opts.body);
      log({ who: "xai-edits", prompt: b.prompt, images: b.images.map((i) => i.type + ":" + i.url.slice(0, 22)) });
      return json({ data: [{ url: "data:image/png;base64," + PNG }] });
    }
    if (u.includes("api.x.ai/v1/images/generations")) { log({ who: "xai-gen" }); return json({ data: [{ url: "data:image/png;base64," + PNG }] }); }
    if (u.includes("api.anthropic.com")) {
      const b = JSON.parse(opts.body); const content = b.messages[b.messages.length - 1].content;
      const parts = Array.isArray(content) ? content : [{ type: "text", text: content }];
      const text = parts.filter((c) => c.type === "text").map((c) => c.text).join("\n");
      log({ who: "anthropic", images: parts.filter((c) => c.type === "image").length, system: b.system.slice(0, 40), text: text.slice(0, 600) });
      return json({ content: [{ type: "text", text: reply(b.system, text) }] });
    }
    if (u.includes("/v1/chat/completions")) {
      const who = u.includes("x.ai") ? "xai-chat" : "openai-chat";
      const b = JSON.parse(opts.body); const sys = b.messages.find((m) => m.role === "system")?.content || "";
      const c = b.messages[b.messages.length - 1].content;
      const text = Array.isArray(c) ? c.filter((x) => x.type === "text").map((x) => x.text).join("\n") : String(c);
      log({ who, images: Array.isArray(c) ? c.filter((x) => x.type === "image_url").length : 0, text: text.slice(0, 600) });
      return json({ choices: [{ message: { content: reply(sys, text) } }], model: b.model });
    }
  } catch (e) {
    log({ who: "fake-error", url: u, error: String(e) });
    return new Response(JSON.stringify({ error: { message: "fake AI could not parse the request: " + e } }), { status: 400 });
  }
  return real(url, opts);
};
