import type { Prisma } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { encryptIntegrationCredentials } from "@/lib/integration-crypto";
import { createInvitationStopLink } from "@/lib/invitation-preferences";
import { escapeHtml } from "@/lib/transactional-email";

// Called in the same transaction that allocates a grant. Never rebuild content on retry.
export async function queueAccessInvitation(tx: Prisma.TransactionClient, input: { inviteId: string; email: string; subject: string; text: string; html: string; idempotencyKey: string }, now = new Date()) {
  const stopUrl = await createInvitationStopLink(tx, input.email, now);
  const message = {
    category: "INVITATION", from: env.emailFrom, replyTo: env.emailReplyTo || null, to: input.email,
    subject: input.subject,
    text: `${input.text}\n\nLeave the waitlist and stop invitation emails: ${stopUrl}`,
    html: `${input.html}<p><a href="${escapeHtml(stopUrl)}">Leave the waitlist and stop invitation emails</a></p>`,
    idempotencyKey: input.idempotencyKey
  };
  // The table retains its original name; both platform and member grants use this outbox.
  await tx.waitlistDelivery.create({ data: { inviteId: input.inviteId, messageCiphertext: encryptIntegrationCredentials(message), nextAttemptAt: now } });
}
