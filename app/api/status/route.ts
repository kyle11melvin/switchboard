import { NextResponse } from "next/server";
import { providerStatus, defaultBrain } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ providers: providerStatus(), brain: defaultBrain() });
}
