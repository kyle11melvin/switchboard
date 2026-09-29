// Image style presets — adapted from the "Prompt as Code" templates in
// github.com/freestylefly/awesome-gpt-image-2 (poster, product, lifestyle photo,
// illustration, UI mockup) plus its global rules: ratio first, no vague adjectives,
// name materials + lighting, lock text rendering, always add an avoid-list.

export interface ImageStyle { id: string; label: string; note: string }

const RULES = `Write the image prompt like code, not prose: (1) state the aspect ratio FIRST; (2) no vague words like "beautiful" or "nice" — name the subject, materials, lighting direction, lens and mood specifically; (3) if any text must appear, quote it exactly and demand it be perfectly legible, otherwise say "no text"; (4) end with an AVOID line listing failure modes (garbled text, extra limbs, watermark, plastic skin, clutter).`;

export const IMAGE_STYLES: ImageStyle[] = [
  {
    id: "auto",
    label: "Auto",
    note: RULES,
  },
  {
    id: "poster",
    label: "Poster / flyer",
    note: `${RULES}\nTEMPLATE — POSTER: Design a [event/product] poster on the theme [theme]. Main visual: [hero element]. Headline: "[exact text]", subhead: "[exact text]". Layout: [centered / left-aligned / diagonal], leave a clear text-safe zone. Style: [minimal / retro / editorial]. State platform + ratio + layout explicitly (e.g. Instagram 4:5, print 8.5x11 portrait). Text must be perfectly legible and spelled exactly as given.`,
  },
  {
    id: "product",
    label: "Product shot",
    note: `${RULES}\nTEMPLATE — PRODUCT: E-commerce hero image of [product], selling points [1], [2]. Scene: [seamless studio backdrop / lifestyle setting]. Shot: [close-up / three-quarter / full]. Material detail: stack keywords ([matte finish], [brushed metal], [soft-touch leather]). Lighting: [softbox / side light / rim light] with named direction. Materials and lighting are the whole game — never leave them implied.`,
  },
  {
    id: "photo",
    label: "Lifestyle photo",
    note: `${RULES}\nTEMPLATE — LIFESTYLE PHOTO: Subject: [person / object / street scene] at [location]. Camera: [35mm / 50mm / 85mm], [f/1.4 shallow depth / f/8 deep], [documentary / cinematic]. Light: [natural window / golden hour / neon night / backlit]. Mood: [one word]. For realism specify skin texture and fine film grain; candid, not posed.`,
  },
  {
    id: "illustration",
    label: "Illustration",
    note: `${RULES}\nTEMPLATE — ILLUSTRATION: [Subject] illustration featuring [character / object]. Style: [flat vector / watercolor wash / impasto / anime / line art] — pin down the brushwork explicitly so it doesn't default to plastic 3D. Line weight: [fine / bold]. Palette: [named colors]. Background: [clean / detailed scene].`,
  },
  {
    id: "ui",
    label: "UI mockup",
    note: `${RULES}\nTEMPLATE — UI MOCKUP: Generate a [iOS / Android / web] screen for [product type]. Core features: [A], [B], [C]. Visual style: [minimal / technical / skeuomorphic], primary color [hex], accent [hex]. Layout: [top nav / two-column / card feed], clear hierarchy, generous whitespace. Lock text: every label must be real, readable English exactly as specified — no gibberish placeholders.`,
  },
  {
    id: "social",
    label: "Social post",
    note: `${RULES}\nTEMPLATE — SOCIAL: Name the platform and ratio first (Instagram feed 4:5, Story 9:16, LinkedIn 1.91:1). One clear focal subject, thumb-stopping contrast, room for a caption overlay. If it's a screenshot-style post, lock the platform's exact UI so styles don't blend. Brand colors if given: navy #1B2A4A, gold #C9A84C.`,
  },
];
