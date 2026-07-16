import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth";
import { BillingUserError, reconcileCheckoutSessionForWorkspace } from "@/lib/billing-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { workspace, impersonation } = await requireWorkspace();
  if (impersonation) {
    return NextResponse.json({ error: "Administrator support sessions are view-only." }, { status: 403 });
  }
  const sessionId = new URL(request.url).searchParams.get("session_id")?.trim();
  if (!sessionId || !sessionId.startsWith("cs_")) {
    return NextResponse.json({ error: "A valid Checkout Session is required." }, { status: 400 });
  }

  try {
    const result = await reconcileCheckoutSessionForWorkspace(sessionId, workspace.id);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof BillingUserError ? 403 : 502;
    const message = error instanceof Error ? error.message : "The Checkout Session could not be verified.";
    return NextResponse.json({ error: message }, { status });
  }
}
