import type { Prisma } from "@/generated/prisma/client";
import { UserFacingError } from "@/lib/user-facing-error";

/** Call inside the same transaction as admission; never clear a stop as a side effect of Start. */
export async function assertMixStartEligible(db: Prisma.TransactionClient, workspaceId: string, contactId: string, mixId: string): Promise<void> {
  await db.$queryRaw`SELECT id FROM "Contact" WHERE id = ${contactId} AND "workspaceId" = ${workspaceId} FOR UPDATE`;
  const [contact, mix, restriction, stop] = await Promise.all([
    db.contact.findFirst({ where: { id: contactId, workspaceId, archivedAt: null }, select: { id: true } }),
    db.mix.findFirst({ where: { id: mixId, workspaceId, status: "ACTIVE" }, select: { id: true } }),
    db.contactRelationshipState.findFirst({ where: { workspaceId, contactId }, select: { doNotContact: true } }),
    db.mixStop.findFirst({ where: { workspaceId, contactId, mixId }, select: { id: true } })
  ]);
  if (!contact || !mix) throw new UserFacingError("Choose a saved person and an active Mix in this account.");
  if (restriction?.doNotContact) throw new UserFacingError("This person is marked Do not contact. Review their contact preference before starting follow-ups.");
  if (stop) throw new UserFacingError("This Mix is stopped for this person. Open More on their contact profile to review and resume the stopped Mix.");
}
