# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One user: Kyle, a mortgage loan officer who also builds his own tools. Switchboard is a personal hub, not a team or customer product. He uses it on both phone and laptop, behind a password gate.

His job in the moment: he has a rough idea (marketing copy, a code question, research, a loan scenario, an image) and wants the best answer several AIs can give, without pasting the same prompt into separate ChatGPT, Grok and Claude tabs and comparing the results by eye.

## Product Purpose

Switchboard takes one rough idea through four steps:

1. **Sharpen** the idea into a tight brief (goal, context, deliverable, constraints, done-criteria). The brief is editable before sending.
2. **Send** the brief to the AIs he picks.
3. **Compare** the answers side by side.
4. **Revise** (optional): after seeing the results, Kyle says in plain words what he'd change; it becomes the next brief, and rounds stay on screen for comparing.
5. **Judge**: one model, working blind and in two steps. It grades every answer and lists the best parts of each, then writes one final answer from that list alone. Switchboard measures how much of the final wording came from each answer. Kyle sees the final answer; the scorecard, red flags and the rest are folded away.

Success means the best combined answer is usable as-is, and anything fabricated or contradicting a locked decision was flagged before he relied on it.

## Positioning

The judge is the gatekeeper step Kyle otherwise does by hand. It grades answers against the brief and against the project's locked decisions, and it must quote the text it objects to. Its job is to protect him from bad information, not to be polite to the models.

## Operating Context

- **Task-type presets** set default routing and add a task instruction: Creative image, Copy & marketing, Code & build, Research, Loan scenario, Gut check (all). Any model can be toggled after picking a preset.
- **Keyword prediction** picks a preset as he types, until he picks one by hand.
- **Projects and locked decisions**: each project holds a list of settled facts, one per line, that rides along with every prompt and with the judge.
- **Image mode**: ChatGPT and Grok draw side by side. Models that cannot draw write a ready-to-paste image prompt instead. Image style templates: Auto, Poster / flyer, Product shot, Lifestyle photo, Illustration, UI mockup, Social.
- **History**: the last 200 runs, text only (images are not stored).
- **Providers**: ChatGPT, Claude and Grok are keyed. Perplexity and Gemini are wired but have no key, so they show as "no key" and cannot be selected.
- **Brain**: the sharpen step and the default judge run on Claude unless `BRAIN_PROVIDER` says otherwise. The judge model can be changed per run.

## Capabilities and Constraints

- **Stack**: Next.js 15 (App Router, TypeScript), React 19. It is not a single HTML file and must not be converted to one.
- **No provider SDKs**: every provider is called with plain fetch in `lib/providers.ts`.
- **Deploy**: Vercel, from GitHub `main`. A push to `main` deploys to production automatically. Live at switchboard-two-puce.vercel.app.
- **Configuration**: API keys are Vercel environment variables. Model IDs can be overridden with `*_MODEL` environment variables without a code change.
- **Password gate**: a login page backed by `APP_PASSWORD`, enforced in `middleware.ts`. It must stay, because anyone with the URL could otherwise spend the API credits.
- **Storage**: projects, locked decisions and history sync between devices through an Upstash Redis store, reached with plain fetch. Each browser keeps its own copy so the app works offline. The most recent change wins. Generated images are not stored.
- **House rules** (`HOUSE_RULES` in `lib/prompts.ts`) are sent with every answer and to the judge. A house-rule violation is always a red flag.
  - Kyle is not a veteran: no military-discount, "as a veteran myself", or personal military-service language on his behalf.
  - No promises of rates, lock timing, approval, or savings.
  - Mortgage guidance must cite the governing source: HUD Handbook 4000.1 (FHA), Fannie Mae Selling Guide, VA Pamphlet 26-7, or the applicable Non-QM investor guideline. A model that is unsure of a section must say so rather than invent one.
- **Not built (v2 ideas)**: decision log that appends accepted verdicts to locked decisions, follow-up rounds, a cost meter per run.

## Brand Commitments

- Name: **Switchboard**. Current tagline in the header: "one idea · every AI · one verdict".
- Type: Fraunces for display and Manrope for body.
- Colors: the Harbor palette, slate teal with one copper accent. Kyle chose it on 29 Sept 2026 to replace navy and gold. Values live in `DESIGN.md`.
- Feel: "The Night Desk": a calm desk with one lamp, quiet surfaces, and the accent used sparingly on what matters (the name, what's selected, Send, the verdict).
- Voice in the interface is plain and direct ("Dump the rough idea", "Judge these answers").

## Evidence on Hand

- The working app and its source: `app/page.tsx` (the whole screen), `lib/prompts.ts` (sharpen, answer and judge instructions), `lib/presets.ts`, `lib/imageStyles.ts`, `lib/providers.ts`.
- `README.md` covers deploy steps and the v2 list.
- Provider logos resolve from `public/logos/`, then the provider's own site icon, then a monogram badge.
- There are no testimonials, customers, usage numbers or benchmarks. Future work must not invent any.

## Product Principles

1. **The answer is the product.** Kyle wants the best answer and to move on. One final answer, never a menu of options. Everything about how it was reached stays folded until asked for.
2. **Receipts over opinions.** Every red flag quotes the text it objects to.
   The judge never sees which model wrote which answer. Answers reach it shuffled and labelled A, B, C, and the names are restored afterwards.
3. **Locked decisions are settled.** Models and the judge do not contradict or relitigate them, and must say so when an answer conflicts with one.
4. **Say "not sure" rather than guess.** Invented facts, APIs, citations and guideline sections are the failure this tool exists to catch.
5. **One person, low friction.** From rough idea to answers in as few steps as possible, on a phone as well as a laptop.
