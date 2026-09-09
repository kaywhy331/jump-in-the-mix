import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { lockAccess } from "@/lib/access-lock";

export class AdmissionError extends Error {
  constructor(message: string, readonly needsMfa = false) { super(message); }
}

export const DEFAULT_ADMISSION_POLICY = {
  accountCeiling: 0, outstandingCeiling: 0, collectionPaused: false,
  grantsPaused: false, referralsPaused: false, redemptionPaused: false, revision: 0
};
export type AdmissionConfiguration = Omit<typeof DEFAULT_ADMISSION_POLICY, "revision">;

export async function getAdmissionPolicy(tx: Prisma.TransactionClient = prisma) {
  return await tx.admissionPolicy.findUnique({ where: { id: "default" } }) ?? { ...DEFAULT_ADMISSION_POLICY, id: "default", updatedAt: null };
}

// All allocation and redemption callers hold lockAccess. Count suspended and
// unverified customers too: restoration must not manufacture additional capacity.
// Staff-only accounts need no customer seat; staff with a workspace still count.
export async function admissionSnapshot(tx: Prisma.TransactionClient) {
  const policy = await getAdmissionPolicy(tx);
  const accounts = await tx.user.count({ where: { OR: [
    { staffMembership: { is: null } }, { ownedWorkspaces: { some: {} } }, { memberships: { some: {} } }
  ] } });
  // Count each unused grant conservatively, including queued or uncertain mail.
  // Revocation/acceptance release this reservation in the same admission lock.
  const outstanding = await tx.referralAccessInvite.count({ where: { acceptedAt: null, revokedAt: null } });
  const remaining = Math.max(0, Math.min(policy.accountCeiling - accounts - outstanding, policy.outstandingCeiling - outstanding));
  return { policy, accounts, outstanding, committed: accounts + outstanding, remaining };
}
export type AdmissionSnapshot = Awaited<ReturnType<typeof admissionSnapshot>>;

export function issuanceProblem(state: AdmissionSnapshot, source: "REFERRAL" | "WAITLIST", requested = 1): string | null {
  if (state.policy.grantsPaused || source === "REFERRAL" && state.policy.referralsPaused) return "New invitations are paused. Please try again later. Your remaining invitations are unchanged.";
  if (requested > state.remaining) return "Invitations are at the current access limit. Please try again later. No invitation was used.";
  return null;
}

export async function getAdmissionSnapshot() {
  return prisma.$transaction(async tx => { await lockAccess(tx); return admissionSnapshot(tx); });
}
