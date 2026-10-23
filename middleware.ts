import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, sameText, sessionToken } from "@/lib/auth";

// Password gate: set APP_PASSWORD in Vercel. A login page sets a cookie that lasts 90 days.
// Without APP_PASSWORD set, the gate is open (local dev).
export async function middleware(req: NextRequest) {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();
  // The phone app has no cookie; it sends the ASK_TOKEN from Vercel's settings as a bearer token.
  if (pathname === "/api/ask") {
    const token = process.env.ASK_TOKEN;
    const sent = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (token && sent && sameText(sent, token)) return NextResponse.next();
    return NextResponse.json({ error: token ? "Wrong token" : "ASK_TOKEN is not set on the server" }, { status: 401 });
  }
  const ok = sameText(req.cookies.get(AUTH_COOKIE)?.value ?? "", await sessionToken(pw));
  if (ok) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

// The home-screen icon and its manifest are fetched by the phone itself, without the login cookie,
// so they sit outside the gate. They contain nothing private.
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|apple-icon|icon|manifest.webmanifest).*)"] };
