// The password gate, shared by the login route and the middleware.
//
// The cookie is a signature of the password made with AUTH_SECRET, a random value that only lives in
// Vercel's settings. Someone who copies the cookie can't test password guesses against it, because
// they'd need the secret too. Changing either the password or the secret signs every device out.
//
// Without AUTH_SECRET the cookie falls back to a plain hash of the password, so the app keeps
// working, but set the secret in production.

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

export const AUTH_COOKIE = "sb_auth";

export async function sessionToken(password: string): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return hex(await crypto.subtle.digest("SHA-256", enc.encode(`switchboard:${password}`)));
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(`switchboard:v2:${password}`)));
}

// Compare without stopping at the first wrong character, so timing doesn't leak how close a guess was.
export function sameText(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i % (b.length || 1));
  return diff === 0;
}
