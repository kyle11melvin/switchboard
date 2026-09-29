import { NextResponse, type NextRequest } from "next/server";

// Password gate: set APP_PASSWORD in Vercel. Browser prompts once, then remembers.
// Without it, anyone with the URL could spend your API credits.
export function middleware(req: NextRequest) {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return NextResponse.next(); // local dev without a password
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const [, pass] = atob(auth.slice(6)).split(":");
    if (pass === pw) return NextResponse.next();
  }
  return new NextResponse("Password required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Switchboard"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
