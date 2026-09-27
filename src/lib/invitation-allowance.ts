import { cache } from "react";
import { getAdmissionPolicy } from "@/lib/admission";
import { prisma } from "@/lib/prisma";
import { REFERRAL_INVITE_LIMIT } from "@/lib/system-mix";

export { INVITATIONS_PATH, invitationsLeftLabel } from "@/lib/invitation-labels";

/**
 * How many personal invitations the owner can still send, or null when there is nothing to offer:
 * none left, invitations paused, or someone other than the workspace owner. Read once per request.
 */
export const invitationsLeft = cache(async function invitationsLeft(userId: string, workspaceId: string): Promise<number | null> {
  const [user, workspace, policy] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { referralInvitesIssued: true, suspendedAt: true } }),
    prisma.workspace.findFirst({ where: { id: workspaceId, ownerId: userId }, select: { id: true } }),
    getAdmissionPolicy()
  ]);
  if (!user || user.suspendedAt || !workspace || policy.grantsPaused || policy.referralsPaused) return null;
  const remaining = Math.max(0, REFERRAL_INVITE_LIMIT - user.referralInvitesIssued);
  return remaining > 0 ? remaining : null;
});
