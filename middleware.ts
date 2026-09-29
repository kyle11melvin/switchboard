import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, sameText, sessionToken } from "@/lib/auth";

// Password gate: set APP_PASSWORD in Vercel. A login page sets a cookie that lasts 90 days.
// Without APP_PASSWORD set, the gate is open (local dev).
export async function middleware(req: NextRequest) {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();
  const ok = sameText(req.cookies.get(AUTH_COOKIE)?.value ?? "", await sessionToken(pw));
  if (ok) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
