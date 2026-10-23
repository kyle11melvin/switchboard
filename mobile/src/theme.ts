// The look, taken from the commercial's own stylesheet (graphics/switchboard-v4 in clipforge) and the
// approved mockups. Dark only. Copper owns the brand, teal owns the answer, green and amber mark
// strong and weak, each AI glows in its own colour.

export const C = {
  ground: "#070D19",
  glass: "rgba(12,20,36,0.86)",
  glass2: "rgba(10,17,30,0.84)",
  edge: "rgba(255,255,255,0.14)",
  edgeStrong: "rgba(255,255,255,0.22)",
  fg: "#F4EFE8",
  fg2: "#DCE3EC",
  muted: "#93A3B8",
  ph: "#6F7D90",
  copper: "#EBA47A",
  copperInk: "#1A1206",
  teal: "#5FD6C9",
  green: "#3DDC97",
  greenInk: "#06261A",
  amber: "#F2B64B",
  blue: "#8EA6FF",
  violet: "#B79CFF",
  claude: "#D97757",
  openai: "#FFFFFF",
  perplexity: "#20B8CD",
  gemini: "#9B72CB",
  xai: "#E6E6E6",
};

export type ProviderId = "openai" | "anthropic" | "xai" | "perplexity" | "gemini";

export const PROVIDER: Record<ProviderId, { name: string; color: string }> = {
  anthropic: { name: "Claude", color: C.claude },
  openai: { name: "ChatGPT", color: C.openai },
  perplexity: { name: "Perplexity", color: C.perplexity },
  gemini: { name: "Gemini", color: C.gemini },
  xai: { name: "Grok", color: C.xai },
};

export const F = {
  display: "Fraunces_700Bold",
  body: "Inter_400Regular",
  medium: "Inter_500Medium",
  semi: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

export const R = { xl: 22, lg: 18, md: 16, sm: 12, pill: 999 };

// A soft glow for a glass edge (iOS shadows; Android gets elevation).
export const glow = (color: string, radius = 18, opacity = 0.55) => ({
  shadowColor: color, shadowOpacity: opacity, shadowRadius: radius, shadowOffset: { width: 0, height: 0 }, elevation: 6,
});
