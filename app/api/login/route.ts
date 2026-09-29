import { NextResponse } from "next/server";

async function token(pw: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`switchboard:${pw}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Compare without stopping at the first wrong character, so timing doesn't leak how close a guess was.
async function same(a: string, b: string) {
  const [x, y] = await Promise.all([token(a), token(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

// Guessing is limited in two places: a Vercel Firewall rule caps attempts per address (see README),
// and every wrong guess waits here before it gets its answer.
const WRONG_GUESS_DELAY_MS = 1000;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
  const pw = process.env.APP_PASSWORD;
  if (!pw || !password || !(await same(password, pw))) {
    await new Promise((r) => setTimeout(r, WRONG_GUESS_DELAY_MS));
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("sb_auth", await token(pw), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}
