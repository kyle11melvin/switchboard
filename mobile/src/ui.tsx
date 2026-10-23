// The pieces of the look: the light behind everything, glass cards, tags, buttons, the AI marks.
import React from "react";
import { Linking, Pressable, StyleSheet, Text, View, type ViewStyle, type StyleProp } from "react-native";
import Svg, { Defs, RadialGradient, Stop, Ellipse, Rect, Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { C, F, R, glow, PROVIDER, type ProviderId } from "./theme";
import { Logo } from "./logos";

// Big soft colour behind the screen, like the film's blurred backgrounds. Three moods.
export function Bokeh({ mood = "mixed", width, height }: { mood?: "mixed" | "warm" | "cool"; width: number; height: number }) {
  const blobs = {
    mixed: [["#EC8C46", 0.30, 0.30, 0.42, 0.26, 0.85], ["#20B8CD", 0.80, 0.42, 0.36, 0.30, 0.75], ["#9B72CB", 0.74, 0.10, 0.32, 0.22, 0.8], ["#4285F4", 0.16, 0.72, 0.34, 0.24, 0.7], ["#EBA47A", 0.60, 0.94, 0.42, 0.22, 0.7]],
    warm: [["#EC8C46", 0.50, 0.28, 0.48, 0.30, 0.9], ["#4285F4", 0.12, 0.62, 0.34, 0.24, 0.65], ["#9B72CB", 0.88, 0.70, 0.34, 0.26, 0.7], ["#20B8CD", 0.50, 0.98, 0.40, 0.20, 0.55]],
    cool: [["#20B8CD", 0.50, 0.20, 0.44, 0.26, 0.8], ["#4285F4", 0.10, 0.62, 0.34, 0.26, 0.7], ["#EC8C46", 0.86, 0.86, 0.40, 0.24, 0.8], ["#9B72CB", 0.90, 0.30, 0.30, 0.20, 0.7]],
  }[mood] as [string, number, number, number, number, number][];
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        {blobs.map(([color, , , , , a], i) => (
          <RadialGradient key={i} id={`b${i}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity={a} />
            <Stop offset="0.55" stopColor={color} stopOpacity={a * 0.35} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        ))}
        <RadialGradient id="vig" cx="50%" cy="42%" r="70%">
          <Stop offset="0.45" stopColor="#03060C" stopOpacity={0} />
          <Stop offset="1" stopColor="#03060C" stopOpacity={0.6} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill="#0A1426" />
      {blobs.map(([, cx, cy, rx, ry], i) => (
        <Ellipse key={i} cx={cx * width} cy={cy * height} rx={rx * width} ry={ry * height} fill={`url(#b${i})`} />
      ))}
      <Rect x="0" y="0" width={width} height={height} fill="url(#vig)" />
    </Svg>
  );
}

// The dark pool behind a long answer (decision 1B).
export function Shade({ width, top, height }: { width: number; top: number; height: number }) {
  return (
    <Svg width={width} height={height} style={{ position: "absolute", left: 0, top }} pointerEvents="none">
      <Defs>
        <RadialGradient id="sh" cx="50%" cy="45%" r="60%">
          <Stop offset="0.3" stopColor="#070D19" stopOpacity={0.88} />
          <Stop offset="1" stopColor="#070D19" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill="url(#sh)" />
    </Svg>
  );
}

export function Glass({ children, color, style, radius = R.lg, pad = 14 }: { children: React.ReactNode; color?: string; style?: StyleProp<ViewStyle>; radius?: number; pad?: number }) {
  return (
    <View style={[{ borderRadius: radius, borderWidth: 2, borderColor: color ?? C.edgeStrong, backgroundColor: C.glass, padding: pad, overflow: "visible" }, color ? glow(color, 16, 0.5) : glow("#000", 20, 0.4), style]}>
      <LinearGradient colors={["rgba(255,255,255,0.09)", "rgba(255,255,255,0)"]} style={{ position: "absolute", left: 0, right: 0, top: 0, height: "50%", borderTopLeftRadius: radius - 2, borderTopRightRadius: radius - 2 }} pointerEvents="none" />
      {children}
    </View>
  );
}

export function Eyebrow({ children, color = C.muted }: { children: React.ReactNode; color?: string }) {
  return <Text style={{ fontFamily: F.semi, fontSize: 11, letterSpacing: 1.8, textTransform: "uppercase", color }}>{children}</Text>;
}

export function Word({ children, color = C.fg, size = 30, center = false }: { children: React.ReactNode; color?: string; size?: number; center?: boolean }) {
  return <Text style={{ fontFamily: F.display, fontSize: size, lineHeight: size * 1.05, color, textAlign: center ? "center" : "left", letterSpacing: 0.3 }}>{children}</Text>;
}

export function Tag({ kind, label, float }: { kind: "strong" | "weak" | "used" | "unused"; label: string; float?: boolean }) {
  const bg = kind === "strong" ? C.green : kind === "weak" ? C.amber : "rgba(255,255,255,0.14)";
  const fg = kind === "strong" ? C.greenInk : kind === "weak" ? C.copperInk : C.fg2;
  return (
    <View style={[{ backgroundColor: bg, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8, alignSelf: "flex-start" }, float && { position: "absolute", top: -13, left: 12, zIndex: 2 }, kind !== "used" && kind !== "unused" && glow(bg, 8, 0.5)]}>
      <Text style={{ fontFamily: F.bold, fontSize: 11, color: fg }}>{label}</Text>
    </View>
  );
}

export function Button({ title, onPress, primary, disabled, style }: { title: string; onPress?: () => void; primary?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [
      { paddingVertical: 14, paddingHorizontal: 18, borderRadius: R.pill, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: primary ? C.copper : C.edgeStrong, backgroundColor: primary ? C.copper : C.glass2, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      primary && glow(C.copper, 18, 0.45), style,
    ]}>
      <Text style={{ fontFamily: F.bold, fontSize: 15, color: primary ? C.copperInk : C.fg }}>{title}</Text>
    </Pressable>
  );
}

export function Mark({ id, size = 22 }: { id: ProviderId; size?: number }) { return <Logo id={id} size={size} />; }
export const nameOf = (id: ProviderId) => PROVIDER[id]?.name ?? id;
export const colorOf = (id: ProviderId) => PROVIDER[id]?.color ?? C.fg;
export const rgba = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

// The three link lines from the icon down to the tiles (the film's "right AIs" shot).
export function Links({ width, colors }: { width: number; colors: string[] }) {
  const h = 54; const n = colors.length; const cx = width / 2;
  return (
    <Svg width={width} height={h} style={{ marginTop: -6 }}>
      {colors.map((c, i) => {
        const x = n === 1 ? cx : (width / n) * (i + 0.5);
        return <Path key={i} d={`M${cx} 0 C ${cx} ${h * 0.55}, ${x} ${h * 0.4}, ${x} ${h}`} stroke={c} strokeWidth={3} fill="none" strokeLinecap="round" />;
      })}
    </Svg>
  );
}

// A small markdown reader for what the AIs write: paragraphs, headings, bullets, code blocks, **bold**,
// `code` and [links](url). Read line by line, so a heading followed straight by text still reads as two.
type Block = { kind: "p"; text: string } | { kind: "h"; text: string } | { kind: "list"; items: string[] } | { kind: "code"; text: string };

function parse(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = []; let list: string[] = []; let code: string[] | null = null;
  const flush = () => {
    if (para.length) { blocks.push({ kind: "p", text: para.join(" ") }); para = []; }
    if (list.length) { blocks.push({ kind: "list", items: list }); list = []; }
  };
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    if (/^\s*```/.test(line)) {
      if (code) { blocks.push({ kind: "code", text: code.join("\n") }); code = null; } else { flush(); code = []; }
      continue;
    }
    if (code) { code.push(raw); continue; }
    if (!line.trim() || /^\s*([-*_]\s*){3,}$/.test(line)) { flush(); continue; }
    const h = /^\s*#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) { flush(); blocks.push({ kind: "h", text: h[1] }); continue; }
    const b = /^\s*([-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (b) { if (para.length) flush(); list.push(line.trim()); continue; }
    if (list.length && /^\s{2,}/.test(raw)) { list[list.length - 1] += " " + line.trim(); continue; } // a bullet wrapped onto the next line
    if (list.length) flush();
    para.push(line.replace(/^\s*>\s?/, "").trim());
  }
  if (code) blocks.push({ kind: "code", text: code.join("\n") });
  flush();
  return blocks;
}

export function Markdown({ text, size = 15, color = C.fg }: { text: string; size?: number; color?: string }) {
  const body = { fontFamily: F.body, fontSize: size, lineHeight: size * 1.45, color };
  return (
    <View style={{ gap: 8 }}>
      {parse(text).map((b, i) => {
        if (b.kind === "h") return <Text key={i} style={{ fontFamily: F.bold, fontSize: size + 1, lineHeight: (size + 1) * 1.4, color: C.fg, marginTop: i ? 4 : 0 }}>{inline(b.text, size)}</Text>;
        if (b.kind === "code") return (
          <View key={i} style={{ backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: C.edge }}>
            <Text style={{ fontFamily: "Menlo", fontSize: size - 2, lineHeight: (size - 2) * 1.5, color: C.copper }}>{b.text}</Text>
          </View>
        );
        if (b.kind === "list") return (
          <View key={i} style={{ gap: 4 }}>
            {b.items.map((l, j) => (
              <View key={j} style={{ flexDirection: "row", gap: 8 }}>
                <Text style={[body, { color: C.copper }]}>{/^\d/.test(l) ? l.match(/^(\d+)/)![1] + "." : "•"}</Text>
                <Text style={[body, { flex: 1 }]}>{inline(l.replace(/^([-*•]|\d+[.)])\s+/, ""), size)}</Text>
              </View>
            ))}
          </View>
        );
        return <Text key={i} style={body}>{inline(b.text, size)}</Text>;
      })}
    </View>
  );
}

function inline(s: string, size: number): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(?<![\w*])\*([^*\n]+)\*(?![\w*])|(?<![\w_])_([^_\n]+)_(?![\w_])/g;
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1]) out.push(<Text key={k++} style={{ fontFamily: F.bold }}>{m[1]}</Text>);
    else if (m[2]) out.push(<Text key={k++} style={{ fontFamily: "Menlo", fontSize: size - 1, color: C.copper }}>{m[2]}</Text>);
    else if (m[3]) out.push(<Text key={k++} style={{ color: C.teal, textDecorationLine: "underline" }} onPress={() => Linking.openURL(m![4]).catch(() => {})}>{m[3]}</Text>);
    else out.push(m[5] ?? m[6]); // *emphasis*: the font has no italic, so just drop the marks
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
