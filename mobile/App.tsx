// Switchboard: one question in, the right AIs, one top answer. One screen, five states.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts, Fraunces_700Bold } from "@expo-google-fonts/fraunces";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import * as Haptics from "expo-haptics";
import { C, F, R, glow, type ProviderId } from "./src/theme";
import { Bokeh, Button, Eyebrow, Glass, Links, Mark, Markdown, Shade, Tag, Word, colorOf, nameOf, rgba } from "./src/ui";
import { ask, loadHistory, loadSettings, saveHistory, saveSettings, type AskEvent, type Round, type Saved, type Settings, type Tier } from "./src/api";

type Phase = "idle" | "picking" | "answering" | "combining" | "answered" | "error";
interface Ai { provider: ProviderId; model: string; status: "wait" | "done" | "failed"; text?: string; error?: string; citations?: string[] }
interface Run {
  question: string; job?: string; why?: string; ais: Ai[]; brief?: string;
  tags?: Extract<AskEvent, { type: "challenged" }>["tags"]; agree?: string; split?: string; flags?: number;
  draft?: string; // the top answer so far, while it is being written
  best?: string; more?: string; builtFrom?: string; checked?: ProviderId[]; usd?: number; error?: string;
}
const ICON = require("./assets/hub.png");

export default function App() {
  const [fontsReady] = useFonts({ Fraunces_700Bold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const { width } = useWindowDimensions();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [history, setHistory] = useState<Saved[]>([]);
  const [left, setLeft] = useState<{ left: number; cap: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [question, setQuestion] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]); // earlier rounds of this thread, oldest first
  const [threadId, setThreadId] = useState<string>("");
  const [followUp, setFollowUp] = useState("");
  const [open, setOpen] = useState(false); // "what was challenged" fold (decision 2B)
  const [more, setMore] = useState(false); // the detail under the short answer
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { loadSettings().then((s) => { setSettings(s); if (!s.token) setShowSettings(true); }); loadHistory().then(setHistory); }, []);

  const onEvent = useCallback((e: AskEvent) => {
    if (e.type === "usage") setLeft({ left: e.usage.left, cap: e.usage.cap });
    setRun((r) => {
      if (!r) return r;
      switch (e.type) {
        case "picked": return { ...r, job: e.jobLabel, why: e.why, ais: e.ais.map((a) => ({ ...a, status: "wait" as const })) };
        case "sharpened": return { ...r, brief: e.brief };
        case "answer": return { ...r, ais: r.ais.map((a) => (a.provider === e.provider ? { ...a, status: e.status, text: e.text, error: e.error, citations: e.citations } : a)) };
        case "challenged": return { ...r, tags: e.tags, agree: e.agree, split: e.split, flags: e.flags };
        case "writing": return { ...r, draft: e.best };
        case "answered": return { ...r, best: e.best, more: e.more, builtFrom: e.builtFrom, checked: e.checked, draft: undefined };
        case "done": return { ...r, usd: e.cost.usd };
        case "error": return { ...r, error: e.message };
        default: return r;
      }
    });
    if (e.type === "picked") setPhase("answering");
    if (e.type === "challenged") { setPhase("combining"); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }
    if (e.type === "answered") { setPhase("answered"); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }
    if (e.type === "error") setPhase("error");
  }, []);

  const roundOf = (r: Run): Round => ({ question: r.question, best: r.best ?? "", more: r.more, checked: r.checked ?? [], tags: r.tags ?? [], agree: r.agree ?? "", split: r.split ?? "", usd: r.usd });

  // Ask a question. With `prior`, it is a follow-up: the earlier rounds go along so the brief can carry
  // the facts over, and the finished round joins the thread.
  async function start(q: string, prior: Round[]) {
    if (!q || !settings) return;
    if (!settings.token) { setShowSettings(true); return; }
    setRounds(prior); setRun({ question: q, ais: [] }); setPhase("picking"); setOpen(false); setMore(false); setFollowUp("");
    abort.current = new AbortController();
    try {
      await ask(settings, q, onEvent, abort.current.signal, prior.map((r) => ({ question: r.question, answer: r.more ? `${r.best}\n\n${r.more}` : r.best })));
    } catch (e: any) {
      setRun((r) => (r ? { ...r, error: e?.message ?? "Something went wrong." } : r)); setPhase("error");
    }
  }
  function send() { setThreadId(`${Date.now()}`); start(question.trim(), []); }
  function sendFollowUp() { if (run?.best) start(followUp.trim(), [...rounds, roundOf(run)]); }

  // Keep the finished thread on the phone: one history item per thread, updated as follow-ups land.
  useEffect(() => {
    if (phase !== "answered" || !run?.best || !threadId) return;
    const item: Saved = { ...roundOf(run), id: threadId, at: Date.now(), rounds: rounds.length ? rounds : undefined };
    setHistory((h) => { const next = [item, ...h.filter((x) => x.id !== threadId)]; saveHistory(next); return next; });
  }, [phase, run?.best]);

  function reset() { abort.current?.abort(); setRun(null); setRounds([]); setThreadId(""); setPhase("idle"); setQuestion(""); setFollowUp(""); setOpen(false); setMore(false); }
  function reopen(s: Saved) {
    setThreadId(s.id); setRounds(s.rounds ?? []);
    setRun({ question: s.question, ais: [], best: s.best, more: s.more, checked: s.checked, tags: s.tags, agree: s.agree, split: s.split, usd: s.usd });
    setPhase("answered"); setOpen(false); setMore(false); setFollowUp("");
  }

  if (!fontsReady || !settings) return <View style={{ flex: 1, backgroundColor: C.ground }} />;
  const mood = phase === "idle" ? "warm" : phase === "answered" ? "cool" : "mixed";

  return (
    <View style={{ flex: 1, backgroundColor: C.ground }}>
      <StatusBar style="light" />
      <Bokeh mood={mood} width={width} height={900} />
      {phase === "answered" && <Shade width={width} top={40} height={620} />}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={st.page} keyboardShouldPersistTaps="handled">
          {/* header */}
          <View style={st.brandRow}>
            <Pressable onPress={reset} style={st.brand}>
              <Image source={ICON} style={[{ width: phase === "idle" ? 0 : 36, height: 36, borderRadius: 9 }, glow(C.copper, 12, 0.4)]} />
              {phase !== "idle" && <Text style={st.wordmarkSmall}>Switchboard</Text>}
            </Pressable>
            <Pressable onPress={() => setShowSettings(true)} hitSlop={12} style={st.gear}><Text style={{ color: C.muted, fontFamily: F.semi, fontSize: 12 }}>{settings.tier === "premium" ? "Premium" : "Standard"}{left ? ` · ${left.left} left` : ""}</Text></Pressable>
          </View>

          {showSettings && <SettingsCard settings={settings} onDone={(s) => { setSettings(s); saveSettings(s); setShowSettings(false); }} />}

          {/* 1 · Ask */}
          {phase === "idle" && !showSettings && (
            <View style={{ gap: 14 }}>
              <View style={st.lockup}>
                <Image source={ICON} style={[{ width: 92, height: 92, borderRadius: 22 }, glow(C.copper, 26, 0.5)]} />
                <Text style={st.wordmark}>Switchboard</Text>
              </View>
              <View style={[st.field, glow(C.copper, 22, 0.5)]}>
                <TextInput value={question} onChangeText={setQuestion} placeholder="Ask anything…" placeholderTextColor={C.ph} multiline style={st.input} returnKeyType="default" />
                <Pressable onPress={send} disabled={!question.trim()} style={[st.send, !question.trim() && { opacity: 0.5 }]}><Text style={{ color: C.copperInk, fontFamily: F.bold, fontSize: 20, marginTop: -2 }}>↑</Text></Pressable>
              </View>
              <View style={st.hintRow}>
                {(["anthropic", "openai", "perplexity", "gemini"] as ProviderId[]).map((p) => <Mark key={p} id={p} size={16} />)}
                <Text style={st.hint}>It picks the AIs that suit the question</Text>
              </View>
              {history.length > 0 && (
                <View style={{ gap: 8, marginTop: 10 }}>
                  <Eyebrow>Recent</Eyebrow>
                  {history.slice(0, 6).map((h) => (
                    <Pressable key={h.id} onPress={() => reopen(h)} style={st.recent}>
                      <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.medium, fontSize: 14, color: C.fg }}>{h.question}</Text>
                      <Text style={{ fontFamily: F.body, fontSize: 11, color: C.muted }}>{new Date(h.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* earlier rounds of this thread, folded to a line each */}
          {phase !== "idle" && rounds.map((r, i) => <Earlier key={i} round={r} />)}

          {/* the question, once asked */}
          {run && phase !== "idle" && (
            <Glass color={rgba(C.copper, 0.75)} radius={R.xl} pad={12}>
              <Text style={{ fontFamily: F.medium, fontSize: 15, color: C.fg }}>{run.question}</Text>
            </Glass>
          )}

          {/* 2 · Working: picking and answering */}
          {(phase === "picking" || phase === "answering") && run && (
            <View style={{ gap: 14 }}>
              {run.brief ? (
                <Glass color={rgba(C.copper, 0.5)}>
                  <Eyebrow color={C.copper}>Sharpened prompt</Eyebrow>
                  <Text numberOfLines={7} style={{ fontFamily: F.body, fontSize: 13, lineHeight: 19, color: C.fg2, marginTop: 6 }}>{run.brief.replace(/\*\*/g, "")}</Text>
                </Glass>
              ) : (
                <Glass><Eyebrow color={C.copper}>{phase === "picking" ? "Working out who should answer" : "Sharpening your question"}</Eyebrow><ActivityIndicator color={C.copper} style={{ marginTop: 10 }} /></Glass>
              )}
              {run.ais.length > 0 && (
                <View style={{ alignItems: "center" }}>
                  <Image source={ICON} style={[{ width: 64, height: 64, borderRadius: 16 }, glow(C.copper, 24, 0.6)]} />
                  <Links width={width - 32} colors={run.ais.map((a) => colorOf(a.provider))} />
                  <View style={{ flexDirection: "row", gap: 10, width: "100%" }}>
                    {run.ais.map((a) => (
                      <Glass key={a.provider} color={colorOf(a.provider)} style={{ flex: 1, alignItems: "center", paddingVertical: 20, gap: 12 }}>
                        <Mark id={a.provider} size={44} />
                        <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.fg }}>{nameOf(a.provider)}</Text>
                      </Glass>
                    ))}
                  </View>
                  {run.why ? <Text style={[st.hint, { marginTop: 10 }]}>{run.job}: {run.why}</Text> : null}
                  <View style={{ width: "100%", gap: 8, marginTop: 14 }}>
                    {run.ais.map((a) => (
                      <View key={a.provider} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <Mark id={a.provider} size={18} />
                        <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.fg, width: 84 }}>{nameOf(a.provider)}</Text>
                        <View style={st.bar}><View style={[st.barFill, { backgroundColor: colorOf(a.provider), width: a.status === "wait" ? "35%" : "100%", opacity: a.status === "failed" ? 0.3 : 1 }, glow(colorOf(a.provider), 6, 0.6)]} /></View>
                        <Text style={{ fontFamily: F.semi, fontSize: 10, letterSpacing: 1.4, color: a.status === "done" ? C.green : a.status === "failed" ? C.amber : C.muted, width: 62, textAlign: "right" }}>{a.status === "wait" ? "THINKING" : a.status === "done" ? "DONE" : "FAILED"}</Text>
                      </View>
                    ))}
                  </View>
                  {run.ais.every((a) => a.status !== "wait") && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16, alignSelf: "flex-start" }}>
                      <ActivityIndicator color={C.copper} size="small" />
                      <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.fg2 }}>All in. Checking the answers against each other…</Text>
                    </View>
                  )}
                  <View style={{ alignSelf: "flex-start", marginTop: 22 }}><Word size={26}>THE RIGHT <Text style={{ color: C.copper }}>AIs.</Text></Word></View>
                </View>
              )}
            </View>
          )}

          {/* 3 · Combining */}
          {phase === "combining" && run && run.tags && (
            <CombineView run={run} width={width} />
          )}

          {/* 4 · Top answer */}
          {phase === "answered" && run?.best && (
            <View style={{ gap: 12 }}>
              <Glass color={rgba(C.teal, 0.85)} radius={R.xl}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Eyebrow color={C.teal}>Top answer</Eyebrow>
                  <View style={[st.ok, glow(C.green, 12, 0.7)]}><Text style={{ color: C.greenInk, fontFamily: F.bold, fontSize: 15 }}>✓</Text></View>
                </View>
                <View style={{ marginTop: 10 }}><Markdown text={run.best} /></View>
                {run.more ? (
                  <Pressable onPress={() => setMore((v) => !v)} hitSlop={8} style={{ marginTop: 10 }}>
                    <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.teal }}>{more ? "Less" : "More"}</Text>
                  </Pressable>
                ) : null}
                {more && run.more ? <View style={{ marginTop: 8 }}><Markdown text={run.more} size={14} color={C.fg2} /></View> : null}
                <Text style={{ fontFamily: F.body, fontSize: 12, color: C.muted, marginTop: 10 }}>
                  {run.checked && run.checked.length > 1 ? `Checked against ${run.checked.map(nameOf).join(", ")}.` : "Only one AI answered, so it was not checked against another."}{run.flags ? ` ${run.flags} weak point${run.flags === 1 ? "" : "s"} caught.` : ""}
                </Text>
                {open && run.tags && (
                  <View style={st.fold}>
                    <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.fg }}>What was challenged</Text>
                    {run.tags.map((t) => (
                      <View key={t.provider} style={[st.mini, { borderColor: colorOf(t.provider) }, glow(colorOf(t.provider), 10, 0.35)]}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Mark id={t.provider} size={16} /><Text style={{ fontFamily: F.bold, fontSize: 12, color: C.fg }}>{nameOf(t.provider)}</Text><Tag kind={t.tag} label={t.label} />
                        </View>
                        {t.reason ? <Text style={st.miniText}>{t.reason}</Text> : null}
                        {t.tag === "strong" && !t.reason ? <Text style={st.miniText}>Clean, specific and well supported. Used in the top answer.</Text> : null}
                      </View>
                    ))}
                    {run.agree ? <View><Eyebrow>Where they agree</Eyebrow><Text style={st.miniText}>{run.agree}</Text></View> : null}
                    {run.split ? <View><Eyebrow>Where they split</Eyebrow><Text style={st.miniText}>{run.split}</Text></View> : null}
                    {run.ais.filter((a) => a.text).length > 0 && (
                      <View style={{ gap: 8 }}>
                        <Eyebrow>Each AI's own answer</Eyebrow>
                        {run.ais.filter((a) => a.text).map((a) => <Own key={a.provider} ai={a} />)}
                      </View>
                    )}
                  </View>
                )}
              </Glass>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Button title="Share" onPress={() => Share.share({ message: run.more ? `${run.best}\n\n${run.more}` : run.best! }).catch(() => {})} style={{ flex: 1 }} />
                {run.tags && run.tags.length > 0 && <Button title={open ? "Hide what was challenged" : "What was challenged"} onPress={() => setOpen((v) => !v)} style={{ flex: 1.4 }} />}
              </View>
              {typeof run.usd === "number" && <Text style={[st.hint, { textAlign: "center" }]}>This question cost about ${run.usd.toFixed(3)} in model calls.</Text>}
              <View style={[st.field, glow(C.copper, 22, 0.5), { marginTop: 6 }]}>
                <TextInput value={followUp} onChangeText={setFollowUp} placeholder="Ask a follow-up…" placeholderTextColor={C.ph} multiline style={st.input} returnKeyType="default" />
                <Pressable onPress={sendFollowUp} disabled={!followUp.trim()} style={[st.send, !followUp.trim() && { opacity: 0.5 }]}><Text style={{ color: C.copperInk, fontFamily: F.bold, fontSize: 20, marginTop: -2 }}>↑</Text></Pressable>
              </View>
              <Text style={[st.hint, { textAlign: "center" }]}>Narrow it, change it, or take it further. The AIs get the question so far.</Text>
              <Button title="New question" onPress={reset} />
            </View>
          )}

          {phase === "error" && run && (
            <View style={{ gap: 12 }}>
              <Glass color={rgba(C.amber, 0.8)}>
                <Eyebrow color={C.amber}>Something went wrong</Eyebrow>
                <Text style={{ fontFamily: F.body, fontSize: 15, color: C.fg, marginTop: 6 }}>{run.error}</Text>
              </Glass>
              <Button title="Try again" primary onPress={() => { setQuestion(run.question); send(); }} />
              <Button title="Start over" onPress={reset} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// An earlier round of the thread: the question on one line, the answer on tap.
function Earlier({ round }: { round: Round }) {
  const [show, setShow] = useState(false);
  return (
    <Pressable onPress={() => setShow((v) => !v)} style={st.earlier}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text numberOfLines={show ? undefined : 1} style={{ flex: 1, fontFamily: F.medium, fontSize: 14, color: C.fg2 }}>{round.question}</Text>
        <Text style={{ fontFamily: F.semi, fontSize: 11, color: C.muted }}>{show ? "hide" : "answer"}</Text>
      </View>
      {show && <View style={{ marginTop: 8 }}><Markdown text={round.best} size={14} color={C.fg2} /></View>}
    </Pressable>
  );
}

function CombineView({ run, width }: { run: Run; width: number }) {
  const tagOf = (p: ProviderId) => run.tags?.find((t) => t.provider === p);
  const ais = run.ais.filter((a) => a.text);
  const [a, b, ...rest] = ais;
  const Card = ({ ai, style }: { ai: Ai; style?: any }) => {
    const t = tagOf(ai.provider);
    return (
      <Glass color={colorOf(ai.provider)} pad={12} style={[{ marginTop: 14 }, style]}>
        {t && <Tag kind={t.tag} label={t.label} float />}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}><Mark id={ai.provider} size={18} /><Text style={{ fontFamily: F.bold, fontSize: 14, color: C.fg }}>{nameOf(ai.provider)}</Text></View>
        <Text numberOfLines={3} style={{ fontFamily: F.body, fontSize: 12, lineHeight: 17, color: C.fg2, marginTop: 6 }}>{t?.reason || ai.text?.replace(/[#*`]/g, "").slice(0, 160)}</Text>
      </Glass>
    );
  };
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {a && <Card ai={a} style={{ flex: 1 }} />}
        {b && <Card ai={b} style={{ flex: 1 }} />}
      </View>
      <Glass color={rgba(run.draft ? C.teal : C.copper, 0.75)} radius={20} style={[{ marginTop: 14, marginHorizontal: run.draft ? 0 : 24, alignItems: "center", gap: 10 }, glow(run.draft ? C.teal : C.copper, 28, 0.6)]}>
        <Image source={ICON} style={[{ width: 60, height: 60, borderRadius: 15 }, glow(C.copper, 20, 0.6)]} />
        <View style={[st.rule, glow(C.copper, 8, 0.8)]} />
        {run.draft ? (
          <View style={{ width: "100%" }}><Markdown text={run.draft} /></View>
        ) : (
          <View style={{ width: "100%", gap: 7 }}>
            {[1, 0.86, 0.7, 0.92].map((w, i) => <View key={i} style={{ height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.26)", width: `${w * 100}%` }} />)}
          </View>
        )}
        <ActivityIndicator color={C.copper} />
      </Glass>
      {rest.map((ai) => <Card key={ai.provider} ai={ai} style={{ marginHorizontal: 36 }} />)}
      <View style={{ marginTop: 20 }}><Word size={30} color={C.copper}>COMBINE.</Word><Text style={[st.hint, { marginTop: 6 }]}>{run.draft ? "Writing the top answer from the best parts." : "Comparing the answers, then writing one from the best parts."}</Text></View>
    </View>
  );
}

function Own({ ai }: { ai: Ai }) {
  const [show, setShow] = useState(false);
  return (
    <Pressable onPress={() => setShow((v) => !v)} style={[st.mini, { borderColor: rgba(colorOf(ai.provider), 0.6) }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Mark id={ai.provider} size={16} /><Text style={{ fontFamily: F.bold, fontSize: 12, color: C.fg }}>{nameOf(ai.provider)}</Text><Text style={{ color: C.muted, fontSize: 11, marginLeft: "auto" }}>{show ? "hide" : "read"}</Text></View>
      {show && <View style={{ marginTop: 6 }}><Markdown text={ai.text ?? ""} size={13} color={C.fg2} /></View>}
      {show && ai.citations?.length ? <Text style={[st.miniText, { color: C.muted }]}>Sources: {ai.citations.slice(0, 4).map((c) => c.replace(/^https?:\/\//, "").slice(0, 40)).join(" · ")}</Text> : null}
    </Pressable>
  );
}

function SettingsCard({ settings, onDone }: { settings: Settings; onDone: (s: Settings) => void }) {
  const [url, setUrl] = useState(settings.url);
  const [token, setToken] = useState(settings.token);
  const [tier, setTier] = useState<Tier>(settings.tier);
  return (
    <Glass color={rgba(C.copper, 0.6)} radius={R.xl}>
      <Eyebrow color={C.copper}>Settings</Eyebrow>
      <Text style={[st.label, { marginTop: 10 }]}>Server address</Text>
      <TextInput value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://…" placeholderTextColor={C.ph} style={st.setInput} />
      <Text style={st.label}>Token (the ASK_TOKEN you set in Vercel)</Text>
      <TextInput value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="paste it here" placeholderTextColor={C.ph} style={st.setInput} />
      <Text style={st.label}>Plan</Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {(["standard", "premium"] as Tier[]).map((t) => (
          <Pressable key={t} onPress={() => setTier(t)} style={[st.plan, tier === t && { borderColor: C.copper, backgroundColor: rgba(C.copper, 0.14) }]}>
            <Text style={{ fontFamily: F.bold, fontSize: 14, color: tier === t ? C.copper : C.fg }}>{t === "standard" ? "Standard" : "Premium"}</Text>
            <Text style={{ fontFamily: F.body, fontSize: 11, color: C.muted }}>{t === "standard" ? "fast models" : "strongest models"}</Text>
          </Pressable>
        ))}
      </View>
      <Button title="Save" primary onPress={() => onDone({ ...settings, url: url.trim(), token: token.trim(), tier })} style={{ marginTop: 14 }} disabled={!url.trim() || !token.trim()} />
    </Glass>
  );
}

const st = StyleSheet.create({
  page: { padding: 16, paddingTop: 56, paddingBottom: 60, gap: 14 },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 36 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  wordmark: { fontFamily: F.display, fontSize: 34, color: C.copper, letterSpacing: -0.3 },
  wordmarkSmall: { fontFamily: F.display, fontSize: 20, color: C.copper },
  gear: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: R.pill, borderWidth: 1, borderColor: C.edge, backgroundColor: C.glass2 },
  lockup: { alignItems: "center", gap: 12, paddingTop: 26, paddingBottom: 8 },
  field: { flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 16, paddingRight: 8, paddingVertical: 8, borderRadius: 22, backgroundColor: "rgba(9,16,30,0.94)", borderWidth: 2, borderColor: rgba(C.copper, 0.75), minHeight: 60 },
  input: { flex: 1, fontFamily: F.medium, fontSize: 16, color: C.fg, maxHeight: 140, paddingVertical: 8 },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.copper, alignItems: "center", justifyContent: "center" },
  hintRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  hint: { fontFamily: F.body, fontSize: 12, color: C.muted },
  recent: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: C.edge, backgroundColor: C.glass2 },
  earlier: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: rgba(C.teal, 0.35), backgroundColor: C.glass2 },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3 },
  ok: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#2FC48A", alignItems: "center", justifyContent: "center" },
  fold: { borderTopWidth: 1, borderTopColor: C.edge, marginTop: 10, paddingTop: 10, gap: 8 },
  mini: { borderRadius: 12, borderWidth: 1.5, padding: 10, backgroundColor: "rgba(10,17,30,0.7)" },
  miniText: { fontFamily: F.body, fontSize: 12, lineHeight: 17, color: C.fg2, marginTop: 4 },
  rule: { width: "100%", height: 3, borderRadius: 2, backgroundColor: C.copper },
  label: { fontFamily: F.semi, fontSize: 12, color: C.muted, marginTop: 8, marginBottom: 4 },
  setInput: { borderWidth: 1, borderColor: C.edgeStrong, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: C.fg, fontFamily: F.body, fontSize: 15, backgroundColor: "rgba(9,16,30,0.9)" },
  plan: { flex: 1, borderWidth: 2, borderColor: C.edge, borderRadius: 14, padding: 12, backgroundColor: C.glass2 },
});
