import { NextResponse } from "next/server";
import { AUTH_COOKIE, sameText, sessionToken } from "@/lib/auth";

// Guessing is limited in two places: a Vercel Firewall rule caps attempts per address (see README),
// and every wrong guess waits here before it gets its answer.
const WRONG_GUESS_DELAY_MS = 1000;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password.slice(0, 200) : "";
  const pw = process.env.APP_PASSWORD;
  if (!pw || !password || !sameText(await sessionToken(password), await sessionToken(pw))) {
    await new Promise((r) => setTimeout(r, WRONG_GUESS_DELAY_MS));
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await sessionToken(pw), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}
