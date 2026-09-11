import { NextResponse } from "next/server";
import { databaseRecoveryStatus } from "@/lib/recovery-hold";

export async function GET() {
  const status = await databaseRecoveryStatus();
  return NextResponse.json({ status }, { headers: { "Cache-Control": "private, no-store" } });
}
