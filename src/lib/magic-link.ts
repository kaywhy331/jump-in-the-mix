import { createBusinessAccount, nameFromEmail } from "@/lib/account-provisioning";
import { AUTH_TOKEN_PURPOSES, findUsableAuthToken, hashAuthToken } from "@/lib/auth-tokens";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { AccessInviteError } from "@/lib/referral-access";

/*
 * Magic sign-in in two steps. The emailed link (GET /api/auth/magic?token=…) only checks the token and
 * hands it to MAGIC_LINK_PAGE in a short-lived HttpOnly cookie scoped to that page, because mail scanners
 * and link previews open links too. The page's "Continue signing in" button posts to
 * consumeMagicLinkAction, which spends the token and creates the session.
 */
export const MAGIC_LINK_PAGE = "/auth/magic";
// Magic links are issued for 15 minutes (requestMagicLinkAction); the hand-off never outlives that.
const MAGIC_LINK_COOKIE_MAX_SECONDS = 15 * 60;
export const MAGIC_LINK_INVALID = "That sign-in link is invalid or expired.";

/** Failures whose fixed wording is safe to sign and show on /login. */
export class MagicLinkError extends Error {}

export function magicLinkCookieName(): string {
  return `${env.cookieName}_magic`;
}

export function magicLinkCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.secureSessionCookie,
    path: MAGIC_LINK_PAGE,
    maxAge: Math.max(0, Math.min(Math.floor(maxAgeSeconds), MAGIC_LINK_COOKIE_MAX_SECONDS))
  };
}

/** Seconds a usable magic-link token has left, or null. A read only: opening the link never spends it. */
export async function magicLinkSecondsLeft(token: string, now = new Date()): Promise<number | null> {
  const record = await findUsableAuthToken(token, AUTH_TOKEN_PURPOSES.magicLogin);
  if (!record) return null;
  return Math.max(Math.floor((record.expiresAt.getTime() - now.getTime()) / 1000), 0);
}

/** Spends the token once and says who signs in and where to go; the same rules the GET handler used. */
export async function claimMagicLink(token: string, returnTo: string | null): Promise<{ userId: string; destination: string }> {
  const record = await findUsableAuthToken(token, AUTH_TOKEN_PURPOSES.magicLogin);
  if (!record) throw new MagicLinkError(MAGIC_LINK_INVALID);
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.verificationToken.updateMany({
      where: { id: record.id, tokenHash: hashAuthToken(token), purpose: AUTH_TOKEN_PURPOSES.magicLogin, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() }
    });
    if (claimed.count !== 1) throw new MagicLinkError("That sign-in link was already used.");
    const user = await tx.user.findUnique({ where: { email: record.email }, select: { id: true, suspendedAt: true, memberships: { select: { workspace: { select: { profile: { select: { onboardingDone: true } } } } }, take: 1 } } });
    // createSession refuses a suspended account too; saying so here keeps the message ours (and signed) and rolls the claim back.
    if (user?.suspendedAt) throw new MagicLinkError("Account access is unavailable. Contact support for help.");
    if (!user) {
      if (env.pilotMode && await tx.user.count() > 0) throw new MagicLinkError("Owner setup is already complete on this server.");
      const created = await createBusinessAccount(tx, { email: record.email, name: nameFromEmail(record.email), passwordHash: null, emailVerifiedAt: new Date() });
      return { userId: created.id, destination: "/onboarding" };
    }
    await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    return { userId: user.id, destination: user.memberships[0]?.workspace.profile?.onboardingDone ? returnTo ?? "/jumps" : "/onboarding" };
  }, { isolationLevel: "Serializable" });
}

/** The /login message for a failed sign-in: our fixed wording only, since a signed message can be replayed. */
export function magicLinkFailureMessage(error: unknown): string {
  if (error instanceof MagicLinkError || error instanceof AccessInviteError) return error.message;
  return "The sign-in link could not be used. Open it again from your email or request a new one.";
}
