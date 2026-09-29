# Switchboard

One idea → sharpened brief → pick your AIs → side-by-side answers → one model judges them all against your project's locked decisions.

## What's in v1

- **Sharpen** — turns a rough idea into a tight brief (goal, deliverable, constraints, done-criteria). Edit it before sending.
- **Presets** — routing defaults by task type (`lib/presets.ts`): Creative image → ChatGPT + Grok, Code → Claude + ChatGPT, Research → Perplexity + Claude + Gemini, Loan scenario, Gut check (all). Toggle any model on/off after picking a preset.
- **Projects + locked decisions** — per-project list of settled facts that gets sent with every prompt *and* to the judge. Stored in your browser.
- **Judge** — one model grades every answer: scorecard, red flags with quoted receipts, where they agree/split, and a best combined answer you can copy.
- **Image mode** — ChatGPT and Grok generate images side by side; tap to download.
- **History** — last 40 runs, in your browser.

## Deploy (GitHub → Vercel, ~10 minutes)

1. Push this folder to a new GitHub repo.
2. Vercel → **Add New Project** → import the repo. Framework auto-detects as Next.js. Deploy.
3. Vercel → project → **Settings → Environment Variables**. Add the keys you have (any subset works — models without a key show as "no key" and can't be selected):

| Variable | Where to get it |
|---|---|
| `APP_PASSWORD` | Make one up. Browser asks once. **Set this** or anyone with the URL spends your credits. |
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

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev                  # http://localhost:3000
```

## Layout

```
app/page.tsx          the whole screen
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
- Server-side storage (projects/history sync across phone + laptop)
- Follow-up rounds: send the judge's questions back to the models
- Cost meter per run
