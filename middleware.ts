import { NextResponse, type NextRequest } from "next/server";

// Password gate: set APP_PASSWORD in Vercel. A login page sets a cookie that lasts 90 days.
// Without APP_PASSWORD set, the gate is open (local dev).
async function token(pw: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`switchboard:${pw}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(req: NextRequest) {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();
  const ok = req.cookies.get("sb_auth")?.value === (await token(pw));
  if (ok) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
