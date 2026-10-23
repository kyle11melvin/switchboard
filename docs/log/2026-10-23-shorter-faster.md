# 2026-10-23 — First real questions, then shorter and faster

## What happened

Kyle merged the core build (PR #6), set `ASK_TOKEN` in Vercel, and ran the app in Expo Go through an
ngrok tunnel (Expo now wants the same free account signed in on the Mac and the phone before it will
tunnel). First real questions, standard plan:

- A code question: Claude + ChatGPT, $0.121.
- A research question (mortgage rate outlook): Perplexity + Claude + Gemini, $0.135, about two minutes.

No "model not found" on either, so the standard plan's ids are good: claude-sonnet-5-5, gpt-5-mini,
gemini-3.5-flash, perplexity/sonar. Premium (opus, gpt-5) is still unverified.

Kyle's verdict: two minutes is too long to wait, and the answer was a full report with raw `###` marks
showing. Both came from the same place: nothing in the chain said "this is a phone".

## Built this session

- `lib/prompts.ts`: `PHONE_BRIEF`, `PHONE_ANSWER`, `PHONE_WRITE`, added by the app's pipeline only. The
  brief asks for the answer first in under 120 words; each AI keeps its answer under 200 words; the
  writer puts the answer under "Best combined answer" and the detail under a new "More" section.
- `lib/pipeline.ts`: the pick and the sharpen run side by side (one round trip saved). The writer
  streams: a `writing` event carries the answer so far, a few times a second; `answered` now has `more`.
- `lib/providers.ts`: `runTextStream`, Claude's streaming API with the same error wording and busy
  retries as every other call. Other providers answer in one piece.
- `mobile/`: the Combine card turns teal and fills with the answer as it is written; "More" folds out
  under the short answer; the reader now handles headings, code blocks, links and wrapped bullets.
- `tests/`: the stand-in Claude streams when asked; 27 checks, all green.

## Open

- Kyle to re-run the mortgage question and report the new time and whether the answer fits a screen.
- The sharpen step no longer sees the job's note (it runs before the job is known). If briefs for code
  questions get vaguer, give the brief step a generic note instead.
- Step 3 next: Supabase accounts, server-side history, RevenueCat.

## Second run, same question

About 45 seconds, $0.106, and the answer fit one screen with "More" under it. Two follow-ups shipped:

- After the last AI lands, the brain grades for about 15 seconds with nothing on screen. The app now
  shows "All in. Checking the answers against each other…" with a spinner under the bars.
- The top answer said "I saw in late 2025" and "my knowledge may be outdated": the writer leaned on a
  model's memory over Perplexity's dated figures and spoke as "I". `PHONE_WRITE` now says to prefer a
  dated, cited figure and never write as "I".
