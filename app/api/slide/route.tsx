import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SLIDE_H, SLIDE_W, themeById, type Slide } from "@/lib/slides";

// Draws one carousel slide as a picture. The text is set as real type, so it is always spelled
// exactly as written, and every slide in a set matches.

export const runtime = "nodejs";
export const maxDuration = 30;

const FONTS = join(process.cwd(), "app", "api", "slide", "fonts");
let fonts: Promise<{ name: string; data: Buffer; weight: 500 | 700 | 800; style: "normal" }[]> | null = null;
const loadFonts = () =>
  (fonts ??= Promise.all([
    readFile(join(FONTS, "fraunces-latin-700-normal.woff")).then((data) => ({ name: "Fraunces", data, weight: 700 as const, style: "normal" as const })),
    readFile(join(FONTS, "manrope-latin-500-normal.woff")).then((data) => ({ name: "Manrope", data, weight: 500 as const, style: "normal" as const })),
    readFile(join(FONTS, "manrope-latin-700-normal.woff")).then((data) => ({ name: "Manrope", data, weight: 700 as const, style: "normal" as const })),
    readFile(join(FONTS, "manrope-latin-800-normal.woff")).then((data) => ({ name: "Manrope", data, weight: 800 as const, style: "normal" as const })),
  ]));

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

// Long headlines step down in size so they always fit.
function headlineSize(kind: Slide["kind"], chars: number) {
  if (kind === "cover") return chars <= 40 ? 124 : chars <= 70 ? 104 : chars <= 110 ? 86 : 70;
  if (kind === "cta") return chars <= 40 ? 100 : chars <= 70 ? 84 : 68;
  return chars <= 24 ? 104 : chars <= 48 ? 86 : chars <= 80 ? 70 : 58;
}
const bodySize = (chars: number) => (chars <= 90 ? 50 : chars <= 160 ? 44 : chars <= 240 ? 38 : 33);

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as any;
  if (!b || typeof b !== "object") return new Response("Nothing to draw", { status: 400 });
  const kind: Slide["kind"] = b.kind === "cover" || b.kind === "cta" ? b.kind : "point";
  const headline = text(b.headline, 220);
  const body = text(b.body, 420);
  if (!headline && !body) return new Response("This slide has no text", { status: 400 });
  const t = themeById(String(b.theme ?? ""));
  const index = Math.max(1, Math.min(99, Number(b.index) || 1));
  const total = Math.max(index, Math.min(99, Number(b.total) || index));
  const name = text(b.name, 60), company = text(b.company, 60), nmls = text(b.nmls, 20).replace(/^#/, ""), phone = text(b.phone, 30);
  const signature = [name, company].filter(Boolean).join("  ·  ");
  const last = index === total;
  const pad = 96;

  return new ImageResponse(
    (
      <div style={{ width: SLIDE_W, height: SLIDE_H, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: pad, backgroundColor: t.bg, backgroundImage: `radial-gradient(1300px 760px at 50% -14%, ${t.glow} 0%, ${t.bg} 70%)`, color: t.text, fontFamily: "Manrope" }}>
        {/* Top: a short rule in the accent, and where you are in the set */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ width: kind === "cover" ? 132 : 72, height: 8, borderRadius: 8, backgroundColor: t.accent }} />
          <div style={{ display: "flex", fontSize: 28, fontWeight: 700, letterSpacing: 2, color: t.muted }}>{`${index} / ${total}`}</div>
        </div>

        {/* Middle: the words */}
        <div style={{ display: "flex", flexDirection: "column", gap: kind === "cover" ? 0 : 36 }}>
          {headline ? (
            <div style={{ display: "flex", fontFamily: "Fraunces", fontWeight: 700, fontSize: headlineSize(kind, headline.length), lineHeight: 1.08, letterSpacing: -1.5, color: kind === "point" ? t.accent : t.text }}>{headline}</div>
          ) : null}
          {body ? (
            <div style={{ display: "flex", fontSize: bodySize(body.length), lineHeight: 1.36, fontWeight: 500, color: t.text }}>{body}</div>
          ) : null}
          {kind === "cta" && phone && !`${headline} ${body}`.replace(/\D/g, "").includes(phone.replace(/\D/g, "") || "x") ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              {phone ? <div style={{ display: "flex", fontSize: 54, fontWeight: 800, color: t.accent }}>{phone}</div> : null}
            </div>
          ) : null}
        </div>

        {/* Bottom: who it's from, and a nudge to keep going */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", borderTop: `2px solid ${t.line}`, paddingTop: 34 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 700 }}>
            {signature ? <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: t.text }}>{signature}</div> : null}
            {nmls ? <div style={{ display: "flex", fontSize: 25, fontWeight: 500, color: t.muted }}>{`NMLS #${nmls}`}</div> : null}
          </div>
          {last ? <div style={{ display: "flex" }} /> : (
            <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, fontWeight: 800, color: t.muted }}>
              <div style={{ display: "flex" }}>Swipe</div>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={t.accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </div>
          )}
        </div>
      </div>
    ),
    { width: SLIDE_W, height: SLIDE_H, fonts: await loadFonts(), headers: { "cache-control": "no-store" } },
  );
}
