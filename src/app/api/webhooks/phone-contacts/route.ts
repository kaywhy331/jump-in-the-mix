import { createHash } from "node:crypto";
import { boundedRequestText, RequestTooLargeError } from "@/lib/bounded-request";
import { parseVcardDeviceContacts } from "@/lib/contact-file-parser";
import { quickAddDeviceContacts, quickAddSentence } from "@/lib/contact-quick-add";
import { resolveContactShareKey } from "@/lib/contact-share-keys";
import { timezoneForUser } from "@/lib/display-preferences";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";

export const runtime = "nodejs";

// Contact cards shared from an iPhone carry the person's photo, so leave room for a few of them.
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_CARDS = 50;
// A share repeated in the same 10-minute slot (a double tap or a quick retry) returns the first answer.
const REPEAT_WINDOW_MS = 10 * 60 * 1000;

// The iPhone shortcut shows the response body as its notification, so every answer is plain text.
function reply(message: string, status: number, headers: Record<string, string> = {}) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...headers } });
}

export async function POST(request: Request) {
  try { return await share(request); }
  catch (error) {
    // Never log the shared card or the error text, which can quote it: only what kind of failure it was.
    console.error("Phone contact share failed", error instanceof Error ? error.name : "unknown");
    return reply("Jump in the Mix couldn't save this right now. Try again.", 503);
  }
}

async function share(request: Request) {
  const { ipAddress } = await getRequestMetadata();
  // Slow down key guessing before any lookup.
  const byAddress = await consumeRateLimit({ scope: "phone-contacts.address", identifiers: [ipAddress], limit: 120, windowMs: 60 * 60 * 1000 });
  if (!byAddress.allowed) return reply("Too many shares just now. Try again in a few minutes.", 429, { "Retry-After": String(byAddress.retryAfterSeconds) });

  const owner = await resolveContactShareKey((request.headers.get("x-jitm-key") ?? "").trim());
  if (!owner) return reply("This key doesn't work. In Jump in the Mix, open Add from your phone and make a new key.", 401);
  const byKey = await consumeRateLimit({ scope: "phone-contacts.key", identifiers: [owner.keyId], limit: 120, windowMs: 60 * 60 * 1000 });
  if (!byKey.allowed) return reply("Too many shares just now. Try again in a few minutes.", 429, { "Retry-After": String(byKey.retryAfterSeconds) });

  let body: string;
  try { body = await boundedRequestText(request, MAX_BODY_BYTES); }
  catch (error) {
    if (error instanceof RequestTooLargeError) return reply("That contact card is too large to add. Try sharing fewer people.", 413);
    return reply("Share a contact from Contacts to add it.", 400);
  }
  const contacts = parseVcardDeviceContacts(body);
  if (!contacts.length) return reply("Share a contact from Contacts to add it.", 400);
  if (contacts.length > MAX_CARDS) return reply(`Share up to ${MAX_CARDS} people at a time. For more, use Import contacts in Jump in the Mix.`, 413);

  const bucket = Math.floor(Date.now() / REPEAT_WINDOW_MS);
  const requestId = createHash("sha256").update(`${owner.keyId}:${bucket}:`).update(body).digest("base64url").slice(0, 40);
  const result = await quickAddDeviceContacts({
    workspaceId: owner.workspaceId,
    actorUserId: owner.userId,
    timezone: await timezoneForUser(owner.userId),
    requestId,
    contacts,
    source: "contacts.phone-share"
  });
  await prisma.contactShareKey.updateMany({ where: { id: owner.keyId }, data: { lastUsedAt: new Date() } })
    .catch(() => console.error("Phone contact key use was not recorded"));
  return reply(quickAddSentence(result), 200);
}
