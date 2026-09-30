// Guess the task type from the words. Only a fallback now: on Send an AI reads the question and picks
// the job and the AIs (app/api/pick). This runs when that call fails, and for runs opened from history.
// Cheap keyword scoring, no API call.

const RULES: { id: string; words: RegExp; weight?: number }[] = [
  { id: "image", words: /\b(image|picture|photo|logo|illustration|render|poster|banner|thumbnail|graphic|artwork|drawing|icon|wallpaper|visual|mockup|flyer design|generate an? (image|pic))\b/i, weight: 3 },
  // Making verbs are a weak hint on their own ("create a landing page" is a build) and a strong one with a photo attached.
  { id: "image", words: /\b(create|make|draw|paint|sketch|cartoon|animate|put (him|her|them|us|me)|turn (this|it|him|her|them|us|me) into|(him|her|them|us|me) (as|in|on|at|wearing|playing|riding|holding))\b/i, weight: 1 },
  { id: "build", words: /\b(website|web ?site|web ?app|app|landing page|code|coding|build|bug|fix|function|component|react|next\.?js|html|css|javascript|typescript|python|sql|database|api|endpoint|deploy|vercel|github|repo|script|schema|crm|dashboard|feature|refactor|error|stack ?trace)\b/i, weight: 2 },
  { id: "research", words: /\b(research|compare|comparison|vs\.?|versus|best|top \d+|which is better|what is|what are|how does|history of|statistics|stats|market|trend|study|studies|source|sources|cite|latest|news|current|price of|cost of|review|reviews)\b/i, weight: 3 },
  { id: "mortgage", words: /\b(mortgage|loan|borrower|fha|va loan|conventional|jumbo|non-?qm|dscr|bank statement|itin|dti|ltv|refi|refinance|heloc|heloan|escrow|underwrit\w*|appraisal|pre-?approv\w*|rate lock|buydown|points|closing costs|down payment|fannie|freddie|4000\.1|guideline|credit score|fico)\b/i, weight: 4 },
  { id: "copy", words: /\b(tagline|slogan|headline|copy|caption|post|posts|instagram|linkedin|tiktok|email|newsletter|subject line|ad|ads|script|pitch|bio|blurb|announcement|write|rewrite|draft|tone|voice|marketing|campaign|cta|flyer|one-?pager|social)\b/i, weight: 2 },
];

export function predictPreset(idea: string, opts: { photos?: boolean } = {}): string | null {
  const text = idea.trim();
  if (text.length < 6) return null;
  const scores: Record<string, number> = {};
  for (const r of RULES) {
    const hits = text.match(new RegExp(r.words.source, "gi"));
    if (hits) scores[r.id] = (scores[r.id] ?? 0) + hits.length * (r.weight ?? 1);
  }
  // A photo plus "create/make/draw", or a scene ("them playing football"), almost always means "draw this".
  if (opts.photos && /\b(playing|wearing|riding|holding|dressed|running|jumping|flying|sitting|standing|dancing|surfing|driving)\b/i.test(text)) scores.image = (scores.image ?? 0) + 1;
  if (opts.photos && scores.image) scores.image += 4;
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}
