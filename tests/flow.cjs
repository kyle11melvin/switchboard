// End-to-end checks of the whole screen against stand-in AIs. Run with `npm test`.
// Builds nothing: run `npm run build` first. Uses Playwright's bundled Chromium.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");

const PORT = 3919;
const ROOT = path.join(__dirname, "..");
const LOG = path.join(__dirname, ".fakeai.log");
const PHOTO = path.join(__dirname, "photo.png");
const BASE = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`); };
const calls = () => (fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const reset = () => fs.writeFileSync(LOG, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function start() {
  reset();
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, OPENAI_API_KEY: "fake", ANTHROPIC_API_KEY: "fake", XAI_API_KEY: "fake", APP_PASSWORD: "", FAKEAI_LOG: LOG, NODE_OPTIONS: `--require ${path.join(__dirname, "fakeai.cjs")}` },
  });
  for (let i = 0; i < 60; i++) {
    try { execSync(`curl -sf -o /dev/null ${BASE}/login`); return server; } catch { await sleep(500); }
  }
  server.kill(); throw new Error("Server didn't start. Did you run npm run build?");
}

async function page(browser, phone) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  await p.route("**/api/sync**", (r) => r.fulfill({ json: { connected: false } }));
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message.slice(0, 120)));
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  return { p, ctx, errors };
}
const bar = (p) => p.locator(".actionrow button").allTextContents().then((t) => t.map((x) => x.trim()).join(" | "));
const hint = (p) => p.locator(".nextstep").textContent().then((t) => t.trim());

(async () => {
  const server = await start();
  const browser = await chromium.launch();
  try {
    // ---- Words: idea → improved → three answers → top answer → change → new ask
    {
      const { p, errors } = await page(browser, true);
      ok("cold open says what to do", /Type what you need/.test(await hint(p)), await hint(p));
      await p.fill("#idea", "Write an instagram post about rate buydowns");
      ok("nothing is chosen while typing; it picks on Ask", (await p.locator(".chip.on").count()) === 0 && /Auto/.test(await p.locator(".modepill").textContent()));
      ok("the AI row is one line that says it picks", /picks the AIs/.test(await p.locator(".modelsline").textContent()));
      ok("the hint says what Ask does", /picks the AIs, improves your question/.test(await hint(p)), await hint(p));
      reset();
      await p.locator(".actionrow .primary").click();
      await p.waitForSelector(".panel.working", { timeout: 5000 });
      ok("working screen appears", true);
      await p.waitForSelector(".verdict .best p", { timeout: 30000 });
      const c = calls();
      const brief = c.find((x) => x.who === "anthropic" && /rough idea/.test(x.system));
      ok("Ask picked the job first", c.some((x) => /decide where a request goes/.test(x.system)));
      ok("the question was improved before asking", !!brief && /instagram/.test(brief.text));
      const answers = c.filter((x) => ["openai-chat", "xai-chat"].includes(x.who) || (x.who === "anthropic" && !/rough idea|gatekeeper|final answer|decide where/.test(x.system)));
      ok("every chosen AI got the improved question, not the raw idea", answers.length >= 2 && answers.every((a) => /GOAL:/.test(a.text)), String(answers.length));
      ok("the judge graded and then wrote", c.some((x) => /gatekeeper/.test(x.system)) && c.some((x) => /final answer/.test(x.system)));
      ok("top answer shown", /top answer/i.test(await p.locator(".verdict .best").textContent()));
      ok("how it got there is folded", !(await p.locator(".grading").first().evaluate((d) => d.open)));
      ok("after results the bar offers Change something and New ask", (await bar(p)) === "Change something | New ask", await bar(p));
      ok("the form folds to one line so the answer comes first", (await p.locator(".asked").count()) === 1 && /rate buydowns/.test(await p.locator(".asked").textContent()) && (await p.locator("#idea").isHidden()));
      ok("the top answer is on the first screen (phone)", await p.evaluate(() => { const r = document.querySelector(".verdict").getBoundingClientRect(); return r.top < window.innerHeight * 0.6; }));
      // Change something
      await p.getByRole("button", { name: "Change something" }).click();
      await p.waitForSelector("#revise-say");
      await p.fill("#revise-say", "Make it shorter and keep the hook");
      reset();
      await p.getByRole("button", { name: /Make the change/ }).click();
      await p.waitForSelector("details.round", { timeout: 30000 });
      await p.waitForSelector(".verdict .best p", { timeout: 30000 });
      ok("a change re-asks with a revised brief", calls().some((x) => /revise a brief/.test(x.system)));
      ok("earlier round is kept", (await p.locator("details.round").count()) === 1);
      // Edit the idea → Ask comes back; New ask clears
      await p.getByRole("button", { name: "Edit" }).click();
      ok("Edit reopens the form", await p.locator("#idea").isVisible());
      await p.fill("#idea", "Write an instagram post about rate buydowns for first-time buyers");
      ok("editing the question brings Ask back", /^Ask /.test(await p.locator(".actionrow .primary").textContent()));
      await p.fill("#idea", "Write an instagram post about rate buydowns");
      await p.getByRole("button", { name: "New ask" }).click();
      await sleep(300);
      ok("New ask clears everything and focuses the box", (await p.inputValue("#idea")) === "" && (await p.locator(".verdict").count()) === 0 && (await p.evaluate(() => document.activeElement?.id)) === "idea");
      ok("history has the runs", (await p.locator(".badge").first().textContent()) === "2");
      await p.locator(".modelsline").click();
      ok("tapping the AI line opens the chips", (await p.locator(".chips.models .chip").count()) === 5);

      ok("no page errors (words)", errors.length === 0, errors.join("; "));
      await p.context().close();
    }

    // ---- Pictures with a photo attached
    {
      const { p, errors } = await page(browser, true);
      await p.fill("#idea", "Mav and Asher playing football");
      await p.locator("input[type=file]").setInputFiles([PHOTO]);
      await p.waitForFunction(() => document.querySelectorAll(".photo img").length === 1);
      ok("a photo shows as a real thumbnail", await p.evaluate(async () => { const i = document.querySelector(".photo img"); await i.decode(); return i.naturalWidth > 8 && i.src.startsWith("data:image/jpeg"); }));
      reset();
      await p.locator(".actionrow .primary").click();
      await p.waitForFunction(() => document.querySelectorAll(".imgwrap img").length === 2, { timeout: 30000 });
      const c = calls();
      ok("ChatGPT drew from the photo", c.some((x) => x.who === "openai-edits" && x.images.length === 1));
      ok("Grok drew from the photo", c.some((x) => x.who === "xai-edits" && x.images.length === 1));
      ok("the improver saw the photo", c.some((x) => x.who === "anthropic" && /rough idea/.test(x.system) && x.images === 1));
      ok("a photo plus a scene was picked as a picture", /Creative image/.test(await p.locator(".chip.on").first().textContent()));
      ok("Save image is offered", (await p.getByRole("button", { name: "Save image" }).count()) === 2);
      ok("hint says what to do with pictures", /Save/.test(await hint(p)));
      await p.getByRole("button", { name: "New ask" }).click();
      await sleep(200);
      ok("New ask clears the photo", (await p.locator(".photo").count()) === 0);
      ok("New ask starts fresh (nothing chosen, picks on Ask)", /Auto/i.test(await p.locator(".modepill").textContent()) && (await p.locator(".chip.on").count()) === 0);
      // Reopen the picture run from history: no pictures kept, so the button offers Redraw
      await p.getByRole("button", { name: /History/ }).click();
      await p.locator("[aria-label=History] button.hist").first().click();
      await sleep(300);
      ok("a picture run from history offers Redraw", /Redraw/.test(await bar(p)), await bar(p));
      ok("no page errors (pictures)", errors.length === 0, errors.join("; "));
      await p.context().close();
    }

    // ---- Failure shows plainly and can be retried
    {
      const { p } = await page(browser, false);
      await p.route("**/api/run", (r) => r.fulfill({ json: { error: "The fake AI is down." } }));
      await p.fill("#idea", "Write an instagram post about rate buydowns");
      await p.locator(".actionrow .primary").click();
      await p.waitForSelector(".card .error", { timeout: 15000 });
      ok("a failed AI says so in plain words with Try again", /fake AI is down/.test(await p.locator(".card .error").first().textContent()) && (await p.getByRole("button", { name: "Try again" }).count()) > 0);
      ok("hint says none answered", /None of them answered|didn't answer/.test(await hint(p)), await hint(p));
      await p.context().close();
    }

    // ---- Layout: no sideways scroll, tap targets
    for (const phone of [true, false]) {
      const { p } = await page(browser, phone);
      ok(`${phone ? "phone" : "laptop"}: no sideways scroll`, await p.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth));
      if (phone) {
        const small = await p.evaluate(() => [...document.querySelectorAll("button, a, input[type=checkbox]")].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.height < 36 || r.width < 36); }).map((b) => (b.getAttribute("aria-label") || b.textContent || b.type).trim().slice(0, 30)));
        // Header icons are 36px drawn with a 46px hit area; everything else must be at least 36px.
        ok("phone: tap targets are big enough", small.length === 0, small.join(", "));
      }
      await p.context().close();
    }
  } finally {
    await browser.close();
    server.kill();
    try { fs.unlinkSync(LOG); } catch {}
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("Test crashed:", e.message); process.exit(1); });
