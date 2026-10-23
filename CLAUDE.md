# Switchboard — working notes for Claude

Kyle Melvin (mortgage lender, Orange County CA) is taking Switchboard to the iOS App Store as a paid
subscription app. He does not write code and reviews on his phone. Treat this file as his standing brief.
Read it, then `docs/log/`, before touching anything.

## What Switchboard is

One question in. Switchboard sharpens the prompt, picks the AI models best suited to the question, gets
their independent answers, compares and challenges them, and combines the best into one top answer.
The pitch: "One question. The right AIs. One top answer." Speak to everyday users, never developers.
Never claim an answer is guaranteed correct; claim it was checked against other AIs.

## Two products in one repo

- **The web tool** (Next.js at the root, deployed on Vercel from `main`): Kyle's own hub, password-gated,
  with image mode, projects, revise and device sync. Leave it working. Its routes are `app/api/brief`,
  `run`, `judge`, `pick`, `revise`, `sync`.
- **The app** (`mobile/`, Expo): the consumer product. One screen. It calls one endpoint, `app/api/ask`,
  which runs the whole pipeline in `lib/pipeline.ts` and streams progress as newline-delimited JSON.
  The engine is shared: `lib/providers.ts` (every AI via plain fetch, with token usage), `lib/prompts.ts`,
  `lib/blind.ts`, `lib/measure.ts`.

## The pipeline (seven model calls per question)

pick the job and the AIs, and sharpen the question (these two run side by side) → two or three
independent answers in parallel → grade blind (tags: strong recommendation / potential weakness / used /
not used, see `lib/tags.ts`) → write one answer from the best parts, streamed as it is written → report
cost. Everything is told it is for a phone (`PHONE_*` in `lib/prompts.ts`, app only): the top answer is
under 120 words, with the detail under "More". Plans and their models are in `lib/tiers.ts`
(standard: Claude Sonnet brain; premium: Claude Opus brain), jobs in `lib/jobs.ts`, cost rates in
`lib/cost.ts`, monthly caps in `lib/usage.ts` (counted per device until accounts exist).

## Settings that live in Vercel, never in the repo

`ASK_TOKEN` (the app's bearer token until accounts exist), `HOUSE_RULES` (the web tool's personal rules;
the app never sends them), the five provider keys, `KV_REST_API_*` for the store. Overrides without a code
change: `TIERS_JSON`, `COST_RATES_JSON`, `*_MODEL`. Never commit a key. Kyle holds every key and pastes
them into Vercel himself; tell him exactly what to paste where.

## The look (locked 2026-10-20)

The commercial's look is the app's look. Tokens in `mobile/src/theme.ts`, taken from the film's stylesheet
(clipforge `graphics/switchboard-v4/comp.html`): ground `#070D19`, glass cards with a 2px glowing border in
the colour of the AI they hold, copper `#EBA47A` for the brand and the ask field, teal `#5FD6C9` only for
the top answer, green `#3DDC97` / amber `#F2B64B` for strong / weak, Fraunces for the wordmark and the big
words (THE RIGHT AIs. / COMBINE.), Inter for everything else. Big saturated light behind every screen.
Decisions: the light dims behind a long answer (1B); "what was challenged" folds out under the answer (2B);
the Combine layout is the second working screen; dark only for v1. The spec pages are private artifacts;
the real icon is `mobile/assets/icon.png`; provider marks are in `mobile/src/logos.tsx`.

## Scope for v1

In: the pipeline, accounts, history, the "what was challenged" view, subscriptions with monthly caps and
question packs, what Apple requires. Out (kept in the web tool, not in the app): image mode, Grok, photos,
projects and locked decisions, "change something", password sync. No new product features.

## The plan

1. Audit: done 2026-10-20 (keep the engine, rebuild the product around it).
2. Core: `api/ask` + the one-screen Expo app (started 2026-10-20), usage caps, cloud builds.
3. Product: Supabase accounts (Sign in with Apple), history on the server, RevenueCat subscriptions and
   packs, the device-id cap becomes a per-user cap.
4. Launch prep: TestFlight, polish from Kyle's notes, listing copy, screenshots (render them from the
   clipforge renderer in the film's look), privacy policy and terms on the Vercel site, submit.
5. Apple review and fixes.

## How to work with Kyle

- Deliver anything visual on a private artifact page, phone-sized, stills before a full build.
- His messages are dictated and sometimes garbled; read for intent, confirm wording that ships.
- Ship a whole step, then list what is missing. Don't ask permission for reversible work.
- Keep replies short. He said "GO" to start the rebuild and picked 1B / 2B on the look.
- A question must feel answered within about a minute and the answer must fit a phone screen; he
  called a two-minute, report-length answer unshippable (2026-10-23).
- This repo is public. No prices, margins or anything from his email in it.

## Testing

`npm run build && npm run test:ask` runs the ask endpoint against stand-in AIs (`tests/fakeai.cjs`), no
keys, no cost. `npm test` adds the web tool's browser walkthrough. For the app: `cd mobile && npx tsc
--noEmit`, then `npx expo start` and open it in Expo Go on an iPhone.

## Project log

`docs/log/` holds one note per session. Add one at the end of any session that changed the pipeline or the
app, and fold any new standing preference into this file.
