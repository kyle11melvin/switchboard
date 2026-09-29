---
name: Switchboard
description: One idea, every AI, one verdict. A quiet slate-teal desk with a single copper accent.
colors:
  copper: "#d9895b"
  copper-light: "#f0aa80"
  copper-ink: "#1f0f05"
  harbor-night: "#0a1517"
  harbor-well: "#0e1c1f"
  harbor-panel: "#12252a"
  harbor-raised: "#183138"
  harbor-glow: "#1c3a42"
  tide-line: "#223d45"
  tide-line-strong: "#2e4f59"
  field-edge: "#5f818c"
  sea-salt: "#ecf3f4"
  fog: "#97adb3"
  fog-dim: "#8199a1"
  flag-red: "#f47c7c"
  flag-red-text: "#ffc6c6"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.625rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  display-phone:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  display-narrow:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.1875rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  numeral:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.375rem"
    fontWeight: 700
    lineHeight: 1
  headline:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.55
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Manrope, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 700
    lineHeight: 1.55
  body:
    fontFamily: "Manrope, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
  reading:
    fontFamily: "Manrope, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  control:
    fontFamily: "Manrope, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.55
  small:
    fontFamily: "Manrope, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.55
  caption:
    fontFamily: "Manrope, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.55
  label:
    fontFamily: "Manrope, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 800
    lineHeight: 1.55
    letterSpacing: "0.1em"
  micro:
    fontFamily: "Manrope, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 800
    lineHeight: 1.55
    letterSpacing: "0.08em"
rounded:
  line: "2px"
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  page-bottom: "120px"
components:
  button-primary:
    backgroundColor: "{colors.copper}"
    textColor: "{colors.copper-ink}"
    rounded: "{rounded.lg}"
    padding: "11px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.sea-salt}"
    rounded: "{rounded.lg}"
    padding: "11px 16px"
  button-ghost-small:
    backgroundColor: "transparent"
    textColor: "{colors.sea-salt}"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
  chip:
    backgroundColor: "{colors.harbor-raised}"
    textColor: "{colors.sea-salt}"
    rounded: "{rounded.pill}"
    padding: "9px 14px"
  chip-selected:
    backgroundColor: "{colors.harbor-raised}"
    textColor: "{colors.copper-light}"
    rounded: "{rounded.pill}"
    padding: "9px 14px"
  field:
    backgroundColor: "{colors.harbor-well}"
    textColor: "{colors.sea-salt}"
    rounded: "{rounded.lg}"
    padding: "12px 14px"
  panel:
    backgroundColor: "{colors.harbor-panel}"
    textColor: "{colors.sea-salt}"
    rounded: "{rounded.xl}"
    padding: "16px"
  verdict-best:
    backgroundColor: "{colors.harbor-panel}"
    textColor: "{colors.sea-salt}"
    typography: "{typography.reading}"
    rounded: "{rounded.lg}"
    padding: "14px 16px"
---

# Design System: Switchboard

## Overview

**Creative North Star: "The Night Desk"**

Switchboard is a desk at night with one lamp on. The surfaces are dark slate teal and stay quiet. The lamp is copper, and it lights only what deserves attention: the name, what is selected, the Send button, and the verdict. Everything else waits in the text colors.

This is a working tool for one person, used on a phone and a laptop. It is scanned and operated, not admired. Density is moderate, controls are large enough to tap, and nothing moves unless something happened. The one authored moment is the verdict arriving, because the verdict is the product.

The palette is called Harbor. It replaced navy and gold on 29 September 2026. The feel and the accent rule were chosen by the owner; the values below are recorded from the shipped stylesheet, `app/globals.css`.

**Key Characteristics:**
- Dark slate-teal surfaces in four close steps, with a soft glow at the top of the page.
- One copper accent, used sparingly.
- Fraunces for the name and headings, Manrope for everything else.
- Hairline borders and tonal steps carry depth. Shadows are nearly absent.
- Pills for things you choose, rounded rectangles for things you read or type in.

## Colors

A cool, low-saturation teal ground with one warm accent, so the accent is never in competition.

### Primary
- **Copper** (`copper`): The accent. Fills the Send button, the switch when on, and the history count. Outlines selected chips and the verdict panel. Rings focused fields.
- **Light Copper** (`copper-light`): Copper for text and thin strokes on dark surfaces. Used for the name, selected chip labels, the verdict label, links, and focus rings on buttons.
- **Copper Ink** (`copper-ink`): Text on a copper fill.

### Neutral
- **Harbor Night** (`harbor-night`): The page.
- **Harbor Well** (`harbor-well`): Recessed surfaces: fields and code blocks. Darker than the panel they sit in.
- **Harbor Panel** (`harbor-panel`): Panels and answer cards.
- **Harbor Raised** (`harbor-raised`): Chips and table headers.
- **Harbor Glow** (`harbor-glow`): The lamp light, a radial wash at the top of the page.
- **Tide Line** (`tide-line`): Hairline borders on panels, cards and tables.
- **Strong Tide Line** (`tide-line-strong`): Chip borders and quiet labels.
- **Field Edge** (`field-edge`): Borders of fields, pickers, outline buttons and the switch when off. It holds 3:1 against the panel so a control can be found.
- **Sea Salt** (`sea-salt`): Primary text.
- **Fog** (`fog`): Secondary text, labels and icons.
- **Dim Fog** (`fog-dim`): Placeholder text only.

### Tertiary
- **Flag Red** (`flag-red`): Errors, destructive actions, and the rule beside the judge's quoted receipts.
- **Flag Red Text** (`flag-red-text`): Error message text on a red-tinted box.

Red is a meaning, not a second accent. It appears only when something is wrong or about to be deleted.

### Named Rules
**The One Lamp Rule.** Copper marks the name, what is selected, Send, the verdict, links and focus. Headings, labels, icons at rest and decoration stay in Sea Salt or Fog. If copper appears in a fifth place, remove it from one of the first four or don't add it.

**The Warm Against Cool Rule.** The accent is the only warm color on the screen. Neutrals stay tinted toward teal; never add a warm grey.

## Typography

**Display Font:** Fraunces (with Georgia, serif)
**Body Font:** Manrope (with -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif)

**Character:** A serif with some personality for the few words that name things, and a plain geometric sans for everything you read and tap. Both are served from the site itself.

### Hierarchy
- **Display** (700, 1.625rem, 1.1): The name "Switchboard". 1.5rem under 480px wide, 1.1875rem under 350px.
- **Headline** (700, 1.125rem): Headings inside answers and the verdict. Set in Sea Salt, balanced across lines.
- **Title** (700, 0.9375rem, Manrope): The AI's name on an answer card.
- **Body** (400, 0.9375rem, 1.55): Interface text.
- **Reading** (400, 1rem, 1.55): Answers on phones and the best answer everywhere. Paragraphs cap at 75ch.
- **Control** (600, 0.875rem): Chip labels, error messages, confirmations.
- **Small** (600, 0.8125rem): Small buttons, hints, the scorecard toggle, the locked-decisions bar.
- **Caption** (500, 0.75rem): Timings, model names, history details, source lists.
- **Label** (800, 0.6875rem, 0.1em, uppercase): Panel labels such as IDEA and VERDICT.
- **Micro** (800, 0.625rem, 0.08em): The history count and the "prompt" tag.
- **Numeral** (700, 1.375rem, Fraunces): The 1, 2, 3 of the empty-state steps.

All sizes are in rem so the browser's text-size setting is respected. Fields never drop below 16px, which stops iOS zooming the page on focus. Numbers in tables and timings use tabular figures.

### Named Rules
**The Two Voices Rule.** Fraunces names things. Manrope says everything else. Buttons, chips, labels and body text are never set in Fraunces.

## Layout

One column, centered, up to 1180px wide, with 16px side gutters that grow to clear a phone's notch. The page reads top to bottom in the order the work happens: idea, choices, brief, verdict, answers. A fixed action bar holds Sharpen and Send at the bottom, within thumb reach, and the page leaves 120px beneath its content so nothing hides behind it.

Panels are separated by 12px. Groups inside a panel use 8 to 14px gaps.

Answer cards sit in a grid that changes with width:
- Under 700px: one column.
- 700px to 1079px: two columns. An odd card out takes the full row.
- 1080px and up: three columns when there are three or five answers.

Cards size to their own content. A short card is never stretched to match a tall one.

On touch screens every control is at least 44px tall. Icon buttons keep a 36px look on phones and carry an invisible 44px hit area. On screens under 480px tall the action bar tightens and the three-step intro is hidden.

## Elevation & Depth

Depth comes from tone, not shadow. Four surface steps stack from Harbor Night up to Harbor Raised, and fields step back down to Harbor Well so they read as recessed. Hairlines separate neighbors.

### Shadow Vocabulary
- **Send glow** (`box-shadow: 0 6px 18px rgba(217, 137, 91, 0.22)`): Under the Send button only. It is the lamp's light on the desk.
- **Panel top light** (`box-shadow: 0 1px 0 rgba(255, 255, 255, 0.02) inset`): A faint inner highlight on the top edge of panels.

The action bar fades the page into Harbor Night behind it and blurs what passes underneath by 8px, so text never collides with the buttons.

### Named Rules
**The Flat Desk Rule.** Nothing floats. No drop shadows on cards, chips or panels. If something needs to stand out, change its surface step or give it the accent.

## Shapes

Two shapes with two meanings. **Pills** (999px) are things you choose: chips, pickers, icon buttons, the switch. **Rounded rectangles** are things you read or type in, and the radius shrinks with the size of the thing:

- 16px: panels and answer cards.
- 12px: fields, buttons, the best-answer box, error boxes.
- 10px: the judge picker, hints, code blocks.
- 8px: table wrappers and quotes.
- 6px: inline code and loading bars.
- 2px: the copper line drawn when the verdict lands.

The 8px and 10px steps are close enough that new work should pick one of the larger three unless it is matching a neighbor.

Borders are 1px. The locked-decisions bar uses a dashed border, the only dashed line in the system, to mark it as something that rides along with the work instead of being part of it.

## Components

### Buttons
- **Shape:** Rounded rectangle (12px), 700 weight.
- **Primary (Send):** Copper gradient from Light Copper to Copper, Copper Ink text, the Send glow beneath. Padding 11px 16px.
- **Ghost (Sharpen, Copy, Discard):** Transparent with a Field Edge border and Sea Salt text. The small size uses 6px 12px padding.
- **Icon button:** A 40px circle with a Field Edge border and a Fog icon.
- **Hover / Focus:** Ghost borders turn Copper on hover, only on devices that hover. Keyboard focus shows a 2px Light Copper ring offset by 2px; on the Send button the ring is Sea Salt.
- **Pressed / Disabled:** Pressing shifts a button down 1px. Disabled buttons drop to 40% opacity.
- **Destructive:** Flag Red text. Deleting asks once, in place, with Keep focused first.

### Chips
- **Style:** Pill on Harbor Raised with a Strong Tide Line border, 600 weight. Task chips lead with a 16px line icon in Fog.
- **Selected:** Copper border, a 14% copper wash, and Light Copper text and icon. The state is also exposed to assistive tech.
- **Unavailable:** 40% opacity with a short reason after the name, such as "no key".

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** Harbor Panel.
- **Shadow Strategy:** None beyond the panel top light. See Elevation & Depth.
- **Border:** 1px Tide Line.
- **Internal Padding:** 16px. Answer cards have a header row with a hairline beneath it.

### Inputs / Fields
- **Style:** Harbor Well fill, 1px Field Edge border, 12px radius, 16px text, a Light Copper caret.
- **Focus:** A 2px Copper ring drawn just inside the edge.
- **Placeholder:** Dim Fog.
- **Error:** A red-tinted box beside or beneath the field that names the problem and the way out.

### Navigation
There is one screen. The header holds the name, the project picker, New idea and History. History and the locked-decisions editor open in place, above the idea panel.

### Verdict
The signature component. A panel with a 60% copper border and a faint copper wash, labelled in Light Copper. Inside, the best answer sits in its own box with a 10% copper wash and reading-size text. The scorecard and comparison fold away beneath it, and open by default when there are red flags.

When the verdict arrives, a copper line draws across the top of the best answer and the text unrolls beneath it over about half a second. With reduced motion on, it fades in instead. This is the only authored animation in the system.

### Red flag
A quoted line from an answer, with a 3px Flag Red rule on its left, light red text and a faint red wash. It always quotes the text it objects to.

### Loading placeholder
Three grey bars of uneven width with a slow shimmer. With reduced motion on, they pulse instead of moving.

## Do's and Don'ts

### Do:
- **Do** follow the One Lamp Rule: copper on the name, what is selected, Send, the verdict, links and focus.
- **Do** build depth from the four surface steps and 1px hairlines.
- **Do** keep field, picker and outline-button edges at 3:1 or better against their surface, and text at 4.5:1 or better.
- **Do** use pills for choices and rounded rectangles for content.
- **Do** keep every touch control at 44px or taller.
- **Do** put the verdict above the answers. It is what gets used.
- **Do** give every animation a reduced-motion version that keeps the state change visible.
- **Do** take every color, radius and easing from the tokens in `app/globals.css`.

### Don't:
- **Don't** use copper on headings, labels, icons at rest, dividers or decoration.
- **Don't** add a second accent color. Red is for errors, deletion and red flags only.
- **Don't** add drop shadows to cards, chips or panels.
- **Don't** set buttons, chips or body text in Fraunces.
- **Don't** use emoji or text glyphs as icons. Icons are drawn, 2px stroke, round caps.
- **Don't** use browser pop-ups to ask or confirm. Ask in place.
- **Don't** return to navy and gold. That palette was replaced.
