import { NextResponse } from "next/server";
import { readChanges, storeConnected, writeChanges } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// What changed since this device last looked. The middleware has already checked the login.
export async function GET(req: Request) {
  if (!storeConnected()) return NextResponse.json({ connected: false });
  const since = Math.max(0, Number(new URL(req.url).searchParams.get("since")) || 0);
  try {
    return NextResponse.json({ connected: true, ...(await readChanges(since)) }, { headers: { "cache-control": "no-store" } });
  } catch (e: any) {
    console.log(`[switchboard] sync read failed: ${e?.message}`);
    return NextResponse.json({ error: e?.message ?? "Sync failed." }, { status: 502 });
  }
}

// Changes made on this device.
export async function POST(req: Request) {
  if (!storeConnected()) return NextResponse.json({ connected: false });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  try {
    return NextResponse.json({ connected: true, ...(await writeChanges(body)) });
  } catch (e: any) {
    console.log(`[switchboard] sync write failed: ${e?.message}`);
    return NextResponse.json({ error: e?.message ?? "Sync failed." }, { status: 502 });
  }
}
