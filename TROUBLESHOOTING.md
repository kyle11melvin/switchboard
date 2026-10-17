# Troubleshooting: separate answers but no top answer

The step that merges every AI's answer into one is the **judge** ("Get the top answer"). If you see the separate answers and no top answer, it's one of the causes below.

## 1. The judge never started

It starts on its own only when all of these are true (`app/page.tsx`, after the answers come back):

- **The "Get the top answer" switch is on.** It sits under the AI chips. Picking a preset resets it to that preset's setting. Every preset has it on except **Creative image** (`lib/presets.ts`).
- **The mode is text.** Image mode never judges.
- **At least 2 AIs answered without an error.** With only one answer there's nothing to merge, and the screen says which AI didn't answer.
- **You stayed on that run.** If you opened another run from history or asked something new, the auto-judge is skipped.

If it didn't start but you have 2 or more good answers, a **Get the top answer** button appears below the answers. Tapping it runs the judge by hand.

## 2. The judge started and failed

You'll see a red message: *"Couldn't get the top answer: … Tap 'Get the top answer' to try again."* The answers stay on screen. Possible causes (`app/api/judge/route.ts`):

- The judging model returned an error: a missing key, a wrong model ID, overload, or a timeout (the two steps together have up to 300 seconds).
- The judge's grading didn't list a "Best parts" section, so there was nothing to write from.
- The final answer came back empty.

A `404` or "model not found" error means the model ID is out of date. Set the override for the judging AI (for example `ANTHROPIC_MODEL`) to a current ID.

## 3. Things it doesn't do

Switchboard never skips the merge because the answers disagree. Apart from the switch above, there's no setting that shows answers side by side instead of merging.

## What to check, in order

1. Is the **Get the top answer** switch on? Picking a preset can turn it off.
2. Did at least 2 AI cards come back without errors?
3. Was there a red "Couldn't get the top answer" message? The text after the colon is the cause.
4. Tap **Get the top answer** to run it again.
