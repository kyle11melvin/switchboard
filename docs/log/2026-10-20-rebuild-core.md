# 2026-10-20 — Audit, the look, and the first core build

## Audit (private artifact, not in the repo)

Verdict: keep the engine, rebuild the product around it. Nothing secret was ever committed. The web tool
runs and its pipeline passed against stand-in AIs; what cannot ship is the shared password, the single
history store, no metering, no native app, and prompts written for Kyle personally.

## The look

Kyle: the commercial looks better than the app; make the app look like that. Two mockup pages were built
from the V4 composition's own stylesheet (see CLAUDE.md for the tokens). He chose 1B (light dims behind a
long answer) and 2B (what was challenged folds out under the answer). Dark only.

## Built this session

- `lib/pipeline.ts`: the whole question in one function with progress events and a cost tally.
- `lib/tiers.ts`, `lib/jobs.ts`, `lib/tags.ts`, `lib/cost.ts`, `lib/usage.ts`.
- `app/api/ask`: streaming NDJSON, bearer `ASK_TOKEN` through the middleware, per-device monthly cap.
- `lib/providers.ts`: token usage on every call, per-call model override, Gemini key in a header.
- `lib/prompts.ts`: house rules moved to the `HOUSE_RULES` env var; the app's pipeline sends none.
- `tests/ask.cjs`: 22 checks, all green, no keys.
- `mobile/`: Expo app, one screen, five states, in the locked look. Settings card takes the server
  address, the token and the plan. Streams through `expo/fetch`.

## Open

- Kyle sets `ASK_TOKEN` (and `HOUSE_RULES` for his web tool) in Vercel, merges the branch, opens the app
  in Expo Go, pastes the token. First real question = first real cost number.
- Model ids in `lib/tiers.ts` are unverified from this container; a 404 on a card means change the id.
- The browser walkthrough (`tests/flow.cjs`) did not finish in this container; endpoints verified directly.
- Step 3 next: Supabase accounts, server-side history, RevenueCat.
