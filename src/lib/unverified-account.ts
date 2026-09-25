import type { Prisma } from "@/generated/prisma/client";
import { ACCOUNT_TOKEN_PURPOSES, invalidateAuthTokens } from "@/lib/auth-tokens";
import { env } from "@/lib/env";

/** Whether an address must be proven before an account counts as its owner's (always, except on a pilot server that does not ask). */
export function emailVerificationRequired(): boolean {
  return env.requireEmailVerification || !env.pilotMode;
}

/*
 * Someone else can register an address with a password before its owner ever signs in (a text invitation
 * accepts any address). When a provider or an emailed sign-in link proves the address belongs to the person
 * signing in, nothing that unverified registration set up survives: its password, every session and every
 * outstanding sign-in, reset or verification link.
 */
export async function releaseUnverifiedAccount(tx: Prisma.TransactionClient, user: { id: string; email: string }, now: Date): Promise<void> {
  await tx.user.update({ where: { id: user.id }, data: { passwordHash: null, emailVerifiedAt: now } });
  await tx.adminMfaSession.deleteMany({ where: { userId: user.id } });
  await tx.session.deleteMany({ where: { userId: user.id } });
  await invalidateAuthTokens(tx, user.email, ACCOUNT_TOKEN_PURPOSES, now);
}
