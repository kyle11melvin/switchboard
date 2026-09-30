# Switchboard

One idea → sharpened brief → pick your AIs → side-by-side answers → one model judges them all against your project's locked decisions.

## What's in v1

- **Sharpen** — turns a rough idea into a tight brief (goal, deliverable, constraints, done-criteria). Edit it before sending.
- **Presets** — routing defaults by task type (`lib/presets.ts`): Creative image → ChatGPT + Grok, Code → Claude + ChatGPT, Research → Perplexity + Claude + Gemini, Loan scenario, Gut check (all). Toggle any model on/off after picking a preset.
- **Projects + locked decisions** — per-project list of settled facts that gets sent with every prompt *and* to the judge. Synced between your devices.
- **Judge** — works in two steps, blind (answers are shuffled and labelled A/B/C; see `lib/blind.ts`). Step 1 grades every answer and lists the best parts of each. Step 2 writes one final answer from that list alone, without seeing the answers, so it can't copy one. Switchboard then counts how much of the final wording came from each answer (`lib/measure.ts`). You see the answer; the grading is folded away.
- **Image mode** — ChatGPT and Grok generate images side by side; tap to download.
- **History** — last 200 runs, synced between your devices.

## Deploy (GitHub → Vercel, ~10 minutes)

1. Push this folder to a new GitHub repo.
2. Vercel → **Add New Project** → import the repo. Framework auto-detects as Next.js. Deploy.
3. Vercel → project → **Settings → Environment Variables**. Add the keys you have (any subset works — models without a key show as "no key" and can't be selected):

| Variable | Where to get it |
|---|---|
| `APP_PASSWORD` | Make one up. Login page, remembered 90 days. **Set this** or anyone with the URL spends your credits. |
| `AUTH_SECRET` | A long random value that signs the login cookie. Make one with `openssl rand -hex 32`. Changing it signs every device out. |
| `OPENAI_API_KEY` | platform.openai.com → API keys (separate from ChatGPT Plus) |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `XAI_API_KEY` | console.x.ai (separate from SuperGrok) |
| `PERPLEXITY_API_KEY` | perplexity.ai → Settings → API |
| `GEMINI_API_KEY` | aistudio.google.com → Get API key |

4. **Deployments → Redeploy** so the env vars take effect.

Each provider bills per use. For personal volume, expect a few dollars a month per provider; image generation is the priciest call (roughly $0.04–$0.20 per image depending on model/size).

### Optional overrides

Model IDs drift. Override without touching code:

`OPENAI_MODEL`, `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_SIZE`, `ANTHROPIC_MODEL`, `XAI_MODEL`, `XAI_IMAGE_MODEL`, `PERPLEXITY_MODEL`, `GEMINI_MODEL`, `BRAIN_PROVIDER` (which model does the sharpen + default judge; default `anthropic`).

If a card shows a `404`/`model not found` error, that's the model ID — set the override to a current one.

## Revise

After results come back, the Sharpen button becomes **Revise**. It asks what you want changed; you answer in plain words. It may ask one or two short follow-up questions, then rewrites the brief from your idea, the brief that was sent, what each AI returned (including pictures), and your feedback. The new brief opens for editing, and Send starts the next round. Earlier rounds stay on screen, folded, for comparing. The AI chips still decide who the next round goes to. Code: `app/Revise.tsx`, `app/api/revise`, `REVISE_SYSTEM` in `lib/prompts.ts`.

## Sync between devices

Projects, locked decisions and run history sync between your phone and laptop.

- **Where it's stored:** an Upstash Redis store connected through the Vercel Marketplace. Vercel adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` to the project. Without them the app still works, and says "Sync is off".
- **When it syncs:** when the app opens, when you come back to it, about a second after any change, and once a minute while it's on screen.
- **The rule:** the most recently changed copy of a project or run wins. Deleting a project or clearing history applies to every device.
- **Offline:** each device keeps its own copy in the browser, so the app opens and works offline. Changes go up when the connection returns.
- **Limits:** the newest 200 runs are kept. Images are not stored.
- **Code:** `lib/merge.ts` (the rules), `lib/store.ts` (storage), `app/api/sync` (the endpoint), `app/useSync.ts` (the browser side).

## Login protection

Wrong passwords are slowed down in two places:

- **In the code** (`app/api/login/route.ts`): every wrong guess waits one second before it's answered.
- **In Vercel Firewall**: a rule named "Limit login attempts" allows 5 tries per minute per address on `/api/login`, then answers 429. It lives in the Vercel project, not in this repo. See it with `vercel firewall rules list --expand`.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev                  # http://localhost:3000
```

## Layout

```
app/page.tsx          the whole screen
app/Markdown.tsx      renders answers and verdicts (loaded separately, it's the heaviest code)
app/api/brief         idea → brief
app/api/run           one model, one answer (browser calls these in parallel)
app/api/judge         grade all answers
lib/providers.ts      every AI, plain fetch, no SDKs
lib/prompts.ts        the sharpen / answer / judge instructions
lib/presets.ts        routing defaults — edit these
middleware.ts         password gate
```

## v2 ideas (not built)

- Decision log: accept a verdict → append to the project's locked decisions automatically
- Follow-up rounds: send the judge's questions back to the models
- Cost meter per run
