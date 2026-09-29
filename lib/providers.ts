// Provider layer: every AI Switchboard can talk to, via plain fetch (no SDKs).
// Model IDs change often — override any of them with env vars, no code change needed.

export type ProviderId = "openai" | "anthropic" | "xai" | "perplexity" | "gemini";
export type Mode = "text" | "image";

export interface RunResult {
  provider: ProviderId;
  model: string;
  text?: string;
  images?: string[]; // data URLs
  citations?: string[];
  promptOnly?: boolean; // image mode, model can't draw: text is a prompt to paste elsewhere
  error?: string;
  ms: number;
}

interface ProviderDef {
  label: string;
  keyEnv: string;
  textModel: () => string;
  imageModel?: () => string;
}

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  openai: {
    label: "ChatGPT",
    keyEnv: "OPENAI_API_KEY",
    textModel: () => process.env.OPENAI_MODEL || "gpt-5",
    imageModel: () => process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
  },
  anthropic: {
    label: "Claude",
    keyEnv: "ANTHROPIC_API_KEY",
    textModel: () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
  },
  xai: {
    label: "Grok",
    keyEnv: "XAI_API_KEY",
    textModel: () => process.env.XAI_MODEL || "grok-4",
    imageModel: () => process.env.XAI_IMAGE_MODEL || "grok-2-image",
  },
  perplexity: {
    label: "Perplexity",
    keyEnv: "PERPLEXITY_API_KEY",
    textModel: () => process.env.PERPLEXITY_MODEL || "sonar-pro",
  },
  gemini: {
    label: "Gemini",
    keyEnv: "GEMINI_API_KEY",
    textModel: () => process.env.GEMINI_MODEL || "gemini-2.5-pro",
  },
};

export function providerStatus() {
  return (Object.keys(PROVIDERS) as ProviderId[]).map((id) => ({
    id,
    label: PROVIDERS[id].label,
    configured: Boolean(process.env[PROVIDERS[id].keyEnv]),
    canImage: Boolean(PROVIDERS[id].imageModel),
    model: PROVIDERS[id].textModel(),
  }));
}

function key(id: ProviderId): string {
  const k = process.env[PROVIDERS[id].keyEnv];
  if (!k) throw new Error(`${PROVIDERS[id].keyEnv} is not set`);
  return k;
}

async function postJSON(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { raw };
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || data?.message || raw.slice(0, 300);
    const text = typeof msg === "string" ? msg : JSON.stringify(msg);
    if (res.status === 401 || res.status === 403) throw new Error(`Key rejected (${res.status}). Check the API key in Vercel and redeploy.`);
    if (res.status === 402 || /insufficient|credit|quota|billing/i.test(text)) throw new Error(`Out of credit on this provider — add billing in their console. (${text.slice(0, 120)})`);
    if (res.status === 404 || /model.*not (found|exist)|does not exist/i.test(text)) throw new Error(`Model ID not recognized — set the *_MODEL env var in Vercel to a current one. (${text.slice(0, 120)})`);
    if (res.status === 429) throw new Error(`Rate limited — try again in a moment.`);
    throw new Error(`${res.status}: ${text}`);
  }
  return data;
}

// OpenAI-compatible chat (OpenAI, xAI, Perplexity all share this shape)
async function openAICompatible(url: string, apiKey: string, model: string, system: string, prompt: string) {
  const messages = [
    ...(system ? [{ role: "system", content: system }] : []),
    { role: "user", content: prompt },
  ];
  const data = await postJSON(url, { authorization: `Bearer ${apiKey}` }, { model, messages });
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  const citations: string[] =
    data?.citations ?? data?.search_results?.map((r: any) => r.url).filter(Boolean) ?? [];
  return { text, citations };
}

export async function runText(id: ProviderId, system: string, prompt: string): Promise<RunResult> {
  const t0 = Date.now();
  const model = PROVIDERS[id].textModel();
  try {
    let text = "";
    let citations: string[] = [];
    switch (id) {
      case "openai":
        ({ text } = await openAICompatible("https://api.openai.com/v1/chat/completions", key(id), model, system, prompt));
        break;
      case "xai":
        ({ text } = await openAICompatible("https://api.x.ai/v1/chat/completions", key(id), model, system, prompt));
        break;
      case "perplexity":
        ({ text, citations } = await openAICompatible("https://api.perplexity.ai/chat/completions", key(id), model, system, prompt));
        break;
      case "anthropic": {
        const data = await postJSON(
          "https://api.anthropic.com/v1/messages",
          { "x-api-key": key(id), "anthropic-version": "2023-06-01" },
          { model, max_tokens: 8000, system: system || undefined, messages: [{ role: "user", content: prompt }] },
        );
        text = (data?.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
        break;
      }
      case "gemini": {
        const data = await postJSON(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key(id)}`,
          {},
          {
            ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
            contents: [{ role: "user", parts: [{ text: prompt }] }],
          },
        );
        text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? "").join("");
        break;
      }
    }
    if (!text) throw new Error("Empty response");
    return { provider: id, model, text, citations: citations.length ? citations : undefined, ms: Date.now() - t0 };
  } catch (e: any) {
    return { provider: id, model, error: e?.message ?? String(e), ms: Date.now() - t0 };
  }
}

const IMAGE_PROMPT_SYSTEM = `You cannot generate images, so instead write ONE production-ready image-generation prompt for the idea. Output only the prompt (60-120 words): subject, composition, lens/lighting, style, mood, aspect ratio, and "no text" unless text is requested. Then on a new line add "Negative: " with 5-8 things to avoid.`;

export async function runImage(id: ProviderId, prompt: string): Promise<RunResult> {
  const t0 = Date.now();
  const def = PROVIDERS[id];
  if (!def.imageModel) {
    const r = await runText(id, IMAGE_PROMPT_SYSTEM, prompt);
    return { ...r, promptOnly: true };
  }
  const model = def.imageModel();
  try {
    const url =
      id === "openai" ? "https://api.openai.com/v1/images/generations" : "https://api.x.ai/v1/images/generations";
    const body: Record<string, unknown> = { model, prompt, n: 1 };
    if (id === "xai") body.response_format = "b64_json";
    if (id === "openai") body.size = process.env.OPENAI_IMAGE_SIZE || "1024x1024";
    const data = await postJSON(url, { authorization: `Bearer ${key(id)}` }, body);
    const images: string[] = (data?.data ?? [])
      .map((d: any) => (d.b64_json ? `data:image/png;base64,${d.b64_json}` : d.url))
      .filter(Boolean);
    if (!images.length) throw new Error("No image returned");
    const revised = data?.data?.[0]?.revised_prompt;
    return { provider: id, model, images, text: revised ? `Revised prompt: ${revised}` : undefined, ms: Date.now() - t0 };
  } catch (e: any) {
    return { provider: id, model, error: e?.message ?? String(e), ms: Date.now() - t0 };
  }
}

// Which provider does the "thinking" steps (brief + judge) when not chosen explicitly.
export function defaultBrain(): ProviderId {
  const pref = (process.env.BRAIN_PROVIDER as ProviderId) || "anthropic";
  if (process.env[PROVIDERS[pref]?.keyEnv]) return pref;
  const any = (Object.keys(PROVIDERS) as ProviderId[]).find(
    (p) => p !== "perplexity" && process.env[PROVIDERS[p].keyEnv],
  );
  return any ?? pref;
}
