import { hashConnectionToken } from "@/lib/connection-tokens";
import { IntakeError, receiveIntake } from "@/lib/intake";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { boundedRequestText } from "@/lib/bounded-request";
import { wakeWorkerAfterResponse } from "@/lib/worker-dispatch-after";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params; const token = request.headers.get("x-jitm-key") ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return Response.json({ error: "A valid X-JITM-Key is required." }, { status: 401 });
  const tokenHash = hashConnectionToken(token);
  const connection = await prisma.intakeConnection.findFirst({ where: { id: connectionId, tokenHash, enabled: true, kind: { not: "HOSTED_FORM" } }, select: { id: true, workspaceId: true } });
  if (!connection) return Response.json({ error: "Connection unavailable." }, { status: 401 });
  const rate = await consumeRateLimit({ scope: "intake", identifiers: [connectionId], limit: 60, windowMs: 60_000 });
  if (!rate.allowed) return Response.json({ error: "Please retry later using the same eventId." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return Response.json({ error: "Send application/json." }, { status: 415 });
  let raw: unknown;
  try { raw = JSON.parse(await boundedRequestText(request, 24_576)); } catch { return Response.json({ error: "Send valid JSON of up to 24 KB." }, { status: 400 }); }
  try {
    const result = await receiveIntake(connectionId, raw, { tokenHash });
    wakeWorkerAfterResponse(connection.workspaceId);
    return Response.json(result, { status: result.status === "REVIEW" ? 202 : result.duplicate ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof IntakeError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "The inquiry could not be saved. Retry using the same eventId." }, { status: 503 });
  }
}
