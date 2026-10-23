// Talking to the server: one streaming call per question, plus the settings that say where the server is.
import { fetch as streamingFetch } from "expo/fetch";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
import type { ProviderId } from "./theme";

export type Tier = "standard" | "premium";
export type TagKind = "strong" | "weak" | "used" | "unused";

export type AskEvent =
  | { type: "usage"; usage: { used: number; cap: number; left: number } }
  | { type: "picked"; job: string; jobLabel: string; why: string; ais: { provider: ProviderId; model: string }[] }
  | { type: "sharpened"; brief: string; asWritten: boolean }
  | { type: "answer"; provider: ProviderId; model: string; status: "done" | "failed"; text?: string; error?: string; citations?: string[]; ms: number }
  | { type: "challenged"; tags: { provider: ProviderId; tag: TagKind; label: string; score?: number; reason?: string }[]; agree: string; split: string; flags: number }
  | { type: "answered"; best: string; builtFrom: string; measured: { name: string; percent: number }[]; fresh: number; checked: ProviderId[]; model: string; provider: ProviderId }
  | { type: "done"; cost: { usd: number; calls: number; input: number; output: number; unpriced: string[] }; ms: number }
  | { type: "error"; stage: string; message: string };

export interface Settings { url: string; token: string; tier: Tier; deviceId: string }

const KEY = "sb.settings";
const defaultUrl = (): string => (Constants.expoConfig?.extra as any)?.apiUrl ?? "";

export async function loadSettings(): Promise<Settings> {
  let s: Partial<Settings> = {};
  try { s = JSON.parse((await AsyncStorage.getItem(KEY)) || "{}"); } catch { /* fresh install */ }
  const deviceId = s.deviceId || Crypto.randomUUID();
  const out: Settings = { url: s.url || defaultUrl(), token: s.token || "", tier: s.tier === "premium" ? "premium" : "standard", deviceId };
  if (!s.deviceId) await saveSettings(out);
  return out;
}

export async function saveSettings(s: Settings): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked; the app still works this session */ }
}

// Ask one question. Events arrive as the server works; the promise settles when the stream ends.
export async function ask(s: Settings, question: string, onEvent: (e: AskEvent) => void, signal?: AbortSignal): Promise<void> {
  const url = s.url.replace(/\/$/, "") + "/api/ask";
  let res: Response;
  try {
    res = await streamingFetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${s.token}`, "x-device-id": s.deviceId },
      body: JSON.stringify({ question, tier: s.tier }),
      signal,
    });
  } catch (e: any) {
    throw new Error(e?.name === "AbortError" ? "Stopped." : "Couldn't reach Switchboard. Check the server address and your connection.");
  }
  if (res.status === 401) throw new Error("The server did not accept the token. Check Settings.");
  if (res.status === 402) { const d = await res.json().catch(() => ({})); throw new Error(d?.error || "You have used this month's questions."); }
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error || `Server error (${res.status}).`); }
  if (!res.body) throw new Error("The server answered without a stream.");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try { onEvent(JSON.parse(line)); } catch { /* a cut line; the next read completes it */ }
    }
  }
}

// What the phone keeps: the last questions and their answers.
export interface Saved { id: string; at: number; question: string; best: string; checked: ProviderId[]; tags: Extract<AskEvent, { type: "challenged" }>["tags"]; agree: string; split: string; usd?: number }
const HKEY = "sb.history";
export async function loadHistory(): Promise<Saved[]> {
  try { const v = JSON.parse((await AsyncStorage.getItem(HKEY)) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
export async function saveHistory(list: Saved[]): Promise<void> {
  try { await AsyncStorage.setItem(HKEY, JSON.stringify(list.slice(0, 50))); } catch { /* ignore */ }
}
