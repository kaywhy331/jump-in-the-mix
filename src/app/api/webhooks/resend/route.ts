import { Webhook } from "svix";
import { env } from "@/lib/env";
import { boundedRequestText } from "@/lib/bounded-request";
import { receiveEmailProviderEvent } from "@/lib/email-events";
import { ZodError } from "zod";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!env.resendWebhookSecret) return Response.json({ error: "Email event processing is unavailable." }, { status: 503, headers });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return Response.json({ error: "Send application/json." }, { status: 415, headers });
  const id = request.headers.get("svix-id") ?? "";
  const timestamp = request.headers.get("svix-timestamp") ?? "";
  const signature = request.headers.get("svix-signature") ?? "";
  if (!id || id.length > 200 || timestamp.length > 20 || signature.length > 2048) return Response.json({ error: "Invalid signature." }, { status: 401, headers });
  let body: string;
  try { body = await boundedRequestText(request, 64 * 1024); } catch { return Response.json({ error: "Request exceeds the allowed body size." }, { status: 413, headers }); }
  try { new Webhook(env.resendWebhookSecret).verify(body, { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": signature }); }
  catch { return Response.json({ error: "Invalid signature." }, { status: 401, headers }); }
  try { return Response.json(await receiveEmailProviderEvent(id, JSON.parse(body)), { headers }); }
  catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError || error instanceof Error && error.message.startsWith("Invalid event")) return Response.json({ error: "Invalid event." }, { status: 400, headers });
    // Non-2xx makes the provider retry; do not log recipient, body, signature, or raw errors.
    return Response.json({ error: "Event could not be saved. Retry with the same event ID." }, { status: 503, headers });
  }
}
