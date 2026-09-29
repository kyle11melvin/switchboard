import { NextResponse } from "next/server";

async function token(pw: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`switchboard:${pw}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: Request) {
  const { password } = await req.json();
  const pw = process.env.APP_PASSWORD;
  if (!pw || password !== pw) return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set("sb_auth", await token(pw), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}
