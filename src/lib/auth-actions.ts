"use server";

import bcrypt from "bcryptjs";
import { captureFormFailure, recoverableFormAction, withSignedError, withViewerError, type ErrorViewer, type FormResult } from "@/lib/form-errors";
import { customerReturnPath } from "@/lib/customer-return-path";
import { accountHome } from "@/lib/account-home";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, destroyAllSessionsForUser, destroyOtherSessions, destroySession, requireSession, requireWorkspace, rotateSession } from "@/lib/auth";
import { ACCOUNT_TOKEN_PURPOSES, AUTH_TOKEN_PURPOSES, findUsableAuthToken, hashAuthToken, invalidateAuthTokens, issueAuthToken } from "@/lib/auth-tokens";
import { sendMagicLoginEmail, sendPasswordChangedEmail, sendPasswordResetEmail, sendVerificationEmail } from "@/lib/auth-email";
import { authEmailLimitReached, emailRecipientHash } from "@/lib/email-budget";
import { env } from "@/lib/env";
import { passwordValidationError } from "@/lib/password-policy";
import { PilotRegistrationClosedError, registrationAllowed } from "@/lib/pilot-registration";
import { prisma } from "@/lib/prisma";
import { clearRateLimit, clearRateLimitUnlessBlocked, consumeRateLimit, isKnownDevice, knownDeviceCookie, knownDeviceCookieName, releaseRateLimitAttempt, type RateLimitDecision } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";
import { createBusinessAccount } from "@/lib/account-provisioning";
import { AccessInviteError, validAccessToken } from "@/lib/referral-access";
import { transactionalEmailConfigured, withEmailAttempts } from "@/lib/transactional-email";
import { lockAccess } from "@/lib/access-lock";
import { claimMagicLink, MagicLinkError, magicLinkCookieName, magicLinkCookieOptions, magicLinkFailureMessage } from "@/lib/magic-link";

const DUMMY_PASSWORD_HASH = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function fail(path: string, message: string): never {
  captureFormFailure(message);
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
}

/** A failure on a signed-in page (/account), signed for the person who will see it. */
function failFor(viewer: ErrorViewer, path: string, message: string): never {
  captureFormFailure(message);
  redirect(withViewerError(path, message, viewer));
}

function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

// Minutes up to 90 minutes, hours up to 48 hours, then days: a day-long block reads "about 24 hours".
function waitText(seconds: number): string {
  const minutes = Math.max(Math.ceil(seconds / 60), 1);
  return minutes < 90
    ? plural(minutes, "minute")
    : minutes < 48 * 60 ? plural(Math.round(minutes / 60), "hour") : plural(Math.round(minutes / (24 * 60)), "day");
}

function rateLimitMessage(seconds: number): string {
  return `Too many attempts. Try again in about ${waitText(seconds)}.`;
}

async function enforceRateLimit(path: string, input: Parameters<typeof consumeRateLimit>[0], viewer?: ErrorViewer): Promise<void> {
  const decision = await consumeRateLimit(input);
  if (decision.allowed) return;
  const message = rateLimitMessage(decision.retryAfterSeconds);
  if (viewer) failFor(viewer, path, message);
  fail(path, message);
}

/*
 * Password checks (sign-in, and the unverified email change below) share three limits, all counted
 * before the account is looked up so they answer the same for an address with no account:
 * - per client address: 30 attempts in 15 minutes, then 30 minutes blocked;
 * - per email and client address: 10 in 15 minutes, then 30 minutes blocked. Keyed on both, so a
 *   stranger elsewhere cannot block the owner's password sign-in;
 * - per email, from anywhere: 10 in 15 minutes, then for 30 minutes no password is checked for that
 *   email and the answer is to use an emailed sign-in link (the step-up). A browser that has signed in
 *   to the account before (known device) is exempt.
 * The returned decision is the step-up; the caller applies it once it knows the account.
 */
const PASSWORD_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_BLOCK_MS = 30 * 60 * 1000;

async function passwordAttemptLimits(path: string, email: string, ipAddress: string | null): Promise<RateLimitDecision> {
  await enforceRateLimit(path, { scope: "auth.login.ip", identifiers: [ipAddress], limit: 30, windowMs: PASSWORD_WINDOW_MS, blockMs: PASSWORD_BLOCK_MS });
  await enforceRateLimit(path, { scope: "auth.login.email-ip", identifiers: [email, ipAddress], limit: 10, windowMs: PASSWORD_WINDOW_MS, blockMs: PASSWORD_BLOCK_MS });
  return consumeRateLimit({ scope: "auth.login.email", identifiers: [email], limit: 10, windowMs: PASSWORD_WINDOW_MS, blockMs: PASSWORD_BLOCK_MS });
}

async function clearPasswordAttempts(email: string, ipAddress: string | null): Promise<void> {
  await Promise.all([
    clearRateLimit("auth.login.email-ip", [email, ipAddress]),
    // The owner's own typos never add up to a step-up; a step-up already under way runs its course.
    clearRateLimitUnlessBlocked("auth.login.email", [email]),
    releaseRateLimitAttempt("auth.login.ip", [ipAddress])
  ]);
}

// The marker a browser keeps once it has signed in to an account (rate-limit.ts: known device).
async function deviceMarker(): Promise<string | undefined> {
  return (await cookies()).get(knownDeviceCookieName())?.value;
}

async function rememberDevice(userId: string): Promise<void> {
  const store = await cookies();
  const marker = knownDeviceCookie(store.get(knownDeviceCookieName())?.value, userId);
  store.set(marker.name, marker.value, marker.options);
}

async function deliverVerification(email: string, name: string): Promise<{ devToken: string | null; deliveryFailed: boolean }> {
  // A silent daily limit per address: the pending page answers the same and states the limit.
  if (await authEmailLimitReached(email, "verifyEmail")) return { devToken: null, deliveryFailed: false };
  const token = await issueAuthToken(email, AUTH_TOKEN_PURPOSES.verifyEmail, env.emailVerificationHours * 60 * 60 * 1000);
  try {
    // Interactive: one provider attempt; the pending page offers "Send another verification link".
    await withEmailAttempts(1, () => sendVerificationEmail(email, name, token));
    return { devToken: process.env.NODE_ENV === "production" ? null : token, deliveryFailed: false };
  } catch (error) {
    console.error("Verification email delivery failed", error);
    return { devToken: process.env.NODE_ENV === "production" ? null : token, deliveryFailed: true };
  }
}

export async function registerAction(formData: FormData): Promise<void> {
  const metadata = await getRequestMetadata();
  const name = value(formData, "name");
  const email = normalizedEmail(value(formData, "email"));
  const confirmEmail = normalizedEmail(value(formData, "confirmEmail"));
  const password = value(formData, "password");
  const accessToken = value(formData, "invite");
  const path = accessToken ? `/register?invite=${encodeURIComponent(accessToken)}` : "/register";
  const mustVerify = !env.pilotMode || env.requireEmailVerification;
  if (!env.pilotMode && !validAccessToken(accessToken)) fail("/register", "Open the unique invitation link shared with you to create an account.");

  await enforceRateLimit(path, { scope: "auth.register.ip", identifiers: [metadata.ipAddress], limit: 8, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });

  if (!name || name.length > 120 || !validEmail(email)) fail(path, "Enter your name and a valid email.");
  const passwordError = passwordValidationError(password);
  if (passwordError) fail(path, passwordError);
  if (mustVerify && process.env.NODE_ENV === "production" && !transactionalEmailConfigured()) {
    fail(path, "Account verification is temporarily unavailable. Please contact support.");
  }

  // A read-only look at the invitation gives a precise answer before anything is claimed or counted;
  // the claim itself stays inside the account transaction.
  const invitation = !env.pilotMode && validAccessToken(accessToken)
    ? await prisma.referralAccessInvite.findFirst({ where: { tokenHash: hashAuthToken(accessToken), acceptedAt: null, revokedAt: null }, select: { recipientEmail: true, recipientPhone: true } })
    : null;
  if (invitation?.recipientEmail && normalizedEmail(invitation.recipientEmail) !== email) {
    fail(path, `This invitation was sent to ${normalizedEmail(invitation.recipientEmail)}. Use that address.`);
  }
  if (invitation && !invitation.recipientEmail && invitation.recipientPhone && confirmEmail !== email) fail(path, "The email addresses don't match.");

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) fail("/login", "An account with that email already exists.");

  // Counted only for a valid, new registration, so typos and invitation mismatches cannot lock an address out for a day.
  await enforceRateLimit(path, { scope: "auth.register.email", identifiers: [email], limit: 3, windowMs: 24 * 60 * 60 * 1000, blockMs: 24 * 60 * 60 * 1000 });

  const passwordHash = await bcrypt.hash(password, 12);
  let user: { id: string; email: string; name: string };
  try {
    user = await prisma.$transaction(async (tx) => {
      if (!registrationAllowed(env.pilotMode, await tx.user.count())) {
        throw new PilotRegistrationClosedError();
      }
      return createBusinessAccount(tx, { email, name, passwordHash, emailVerifiedAt: mustVerify ? null : new Date(), accessToken });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof AccessInviteError) {
      // A paused, used or revoked invitation is the invitation's state, not a guess at the address.
      await releaseRateLimitAttempt("auth.register.email", [email]);
      fail(path, error.message);
    }
    if (error instanceof PilotRegistrationClosedError) {
      fail("/login", "Owner setup is complete. Sign in with the owner account.");
    }
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "P2002") fail("/login", "An account with that email already exists.");
    if (env.pilotMode && code === "P2034" && (await prisma.user.count()) > 0) {
      fail("/login", "Owner setup is complete. Sign in with the owner account.");
    }
    if (code === "P2034") fail(path, "Another access request was processed at the same time. Please try again.");
    throw error;
  }

  await clearRateLimit("auth.register.email", [email]);

  if (mustVerify) {
    const delivery = await deliverVerification(user.email, user.name);
    // registered=1 is the first screen after sign-up; sent=1 is a resend.
    const params = new URLSearchParams({ email: user.email, registered: "1" });
    if (delivery.devToken) params.set("devToken", delivery.devToken);
    if (delivery.deliveryFailed) params.set("delivery", "failed");
    redirect(`/verify-email/pending?${params.toString()}`);
  }

  await createSession(user.id);
  await rememberDevice(user.id);
  redirect("/onboarding");
}

export async function loginAction(formData: FormData): Promise<void> {
  const metadata = await getRequestMetadata();
  const email = normalizedEmail(value(formData, "email"));
  const password = value(formData, "password");
  const returnTo = customerReturnPath(value(formData, "next"));
  const path = returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login";

  const stepUp = await passwordAttemptLimits(path, email, metadata.ipAddress);
  const user = validEmail(email) ? await prisma.user.findUnique({ where: { email } }) : null;
  // The same answer for every address in step-up, with or without an account; no password is checked.
  if (!stepUp.allowed && !(user && isKnownDevice(await deviceMarker(), user.id))) {
    fail(path, transactionalEmailConfigured()
      ? `For your security, password sign-in for this email is paused for about ${waitText(stepUp.retryAfterSeconds)}. Use “Email me a secure sign-in link” below instead.`
      : rateLimitMessage(stepUp.retryAfterSeconds));
  }
  const matches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH).catch(() => false);
  if (!user || !matches) fail(path, "The email or password is incorrect.");
  if (user.suspendedAt) fail(path, "Account access is paused. Contact support for help.");

  if ((env.requireEmailVerification || !env.pilotMode) && !user.emailVerifiedAt) {
    redirect(`/verify-email/pending?email=${encodeURIComponent(user.email)}`);
  }

  await Promise.all([clearPasswordAttempts(email, metadata.ipAddress), createSession(user.id)]);
  await rememberDevice(user.id);
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    include: { workspace: { include: { profile: true } } }
  });
  redirect(await accountHome(user.id, membership?.workspace.profile?.onboardingDone ? returnTo ?? "/jumps" : "/onboarding"));
}

export async function requestMagicLinkAction(formData: FormData): Promise<void> {
  const metadata = await getRequestMetadata();
  const email = normalizedEmail(value(formData, "email"));
  const returnTo = customerReturnPath(value(formData, "next"));
  const path = returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login";
  await enforceRateLimit(path, { scope: "auth.magic.ip", identifiers: [metadata.ipAddress], limit: 12, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
  await enforceRateLimit(path, { scope: "auth.magic.email", identifiers: [email], limit: 5, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
  if (!validEmail(email)) fail(path, "Enter a valid email address.");
  if (!transactionalEmailConfigured()) fail(path, "Email sign-in is not configured on this server. Use your password instead.");
  // Every outcome below shows the same "check your inbox" page, whether or not a link was sent.
  const params = new URLSearchParams({ magicSent: "1" });
  if (returnTo) params.set("next", returnTo);
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, suspendedAt: true } });
  if (existing?.suspendedAt) redirect(`/login?${params.toString()}`);
  if (!existing) {
    const allowed = env.pilotMode
      ? await prisma.user.count() === 0
      : false;
    if (!allowed) redirect(`/login?${params.toString()}`);
  }
  // A silent daily limit per address; a browser that has signed in to the account before is exempt.
  if (!(existing && isKnownDevice(await deviceMarker(), existing.id)) && await authEmailLimitReached(email, "magicLogin")) redirect(`/login?${params.toString()}`);
  const token = await issueAuthToken(email, AUTH_TOKEN_PURPOSES.magicLogin, 15 * 60_000);
  try {
    await withEmailAttempts(1, () => sendMagicLoginEmail(email, token, returnTo));
  } catch (error) {
    console.error("Magic sign-in email failed", error);
    fail(path, "The sign-in email could not be delivered. Try again or use your password.");
  }
  if (process.env.NODE_ENV !== "production") params.set("devToken", token);
  redirect(`/login?${params.toString()}`);
}

/** The "Continue signing in" button on /auth/magic: spends the token the emailed link handed over and signs in. */
export async function consumeMagicLinkAction(formData: FormData): Promise<void> {
  const store = await cookies();
  const token = store.get(magicLinkCookieName())?.value ?? "";
  // One attempt per hand-off: clear it whatever happens; opening the emailed link again sets it while the token is usable.
  store.set(magicLinkCookieName(), "", magicLinkCookieOptions(0));
  const returnTo = customerReturnPath(value(formData, "next"));
  let destination: string;
  try {
    const result = await claimMagicLink(token, returnTo);
    await createSession(result.userId);
    await rememberDevice(result.userId);
    destination = await accountHome(result.userId, result.destination);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    if (!(error instanceof MagicLinkError)) console.error("Magic sign-in failed", error);
    redirect(withSignedError("/login", magicLinkFailureMessage(error)));
  }
  redirect(destination);
}

export async function demoLoginAction(): Promise<void> {
  const metadata = await getRequestMetadata();
  await enforceRateLimit("/login", { scope: "auth.demo.ip", identifiers: [metadata.ipAddress], limit: 20, windowMs: 15 * 60 * 1000 });
  // Fixed wording, so it is signed for /login (A2's public rule).
  if (!env.demoMode) redirect(withSignedError("/login", "The demo workspace is disabled in this environment."));
  const user = await prisma.user.findUnique({ where: { email: env.demoEmail } });
  if (!user) redirect(withSignedError("/login", "The demo workspace is not ready yet. Run the seed command and try again."));
  await createSession(user.id);
  redirect("/jumps?demo=1");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/signed-out");
}

export async function resendVerificationAction(formData: FormData): Promise<void> {
  const metadata = await getRequestMetadata();
  const email = normalizedEmail(value(formData, "email"));
  const path = `/verify-email/pending?email=${encodeURIComponent(email)}`;
  await enforceRateLimit(path, { scope: "auth.verify.resend.ip", identifiers: [metadata.ipAddress], limit: 10, windowMs: 60 * 60 * 1000 });
  await enforceRateLimit(path, { scope: "auth.verify.resend.email", identifiers: [email], limit: 4, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });

  const user = validEmail(email) ? await prisma.user.findUnique({ where: { email }, select: { email: true, name: true, emailVerifiedAt: true } }) : null;
  let devToken: string | null = null;
  let deliveryFailed = false;
  if (user && !user.emailVerifiedAt) {
    const delivery = await deliverVerification(user.email, user.name);
    devToken = delivery.devToken;
    deliveryFailed = delivery.deliveryFailed;
  }

  const params = new URLSearchParams({ email, sent: "1" });
  if (devToken) params.set("devToken", devToken);
  if (deliveryFailed) params.set("delivery", "failed");
  redirect(`/verify-email/pending?${params.toString()}`);
}

// Every refusal before the email changes reads the same, so the form never says which check failed.
const EMAIL_CHANGE_REFUSED = "We couldn’t change the email. Check the email and password you signed up with. Only an account created from a text invitation can change its email here, before it is verified.";

class EmailChangeRefused extends Error {}
class EmailChangeTaken extends Error {}

/**
 * "Wrong email?" on the verification page, for an account created from a text invitation (where the
 * person typed their own address) that has not been verified. There is no session before verification,
 * so this is a password check: it shares the sign-in limits, including the step-up, and answers every
 * failure identically. The old address loses every outstanding link, since links belong to an address.
 */
export async function changeUnverifiedEmailAction(formData: FormData): Promise<void> {
  const metadata = await getRequestMetadata();
  const email = normalizedEmail(value(formData, "email"));
  const password = value(formData, "password");
  const newEmail = normalizedEmail(value(formData, "newEmail"));
  const confirmNewEmail = normalizedEmail(value(formData, "confirmNewEmail"));
  const path = `/verify-email/pending?email=${encodeURIComponent(email)}`;
  // Checks of what was typed, before anything stored is read.
  if (!validEmail(newEmail)) fail(path, "Enter the correct email address.");
  if (newEmail !== confirmNewEmail) fail(path, "The new email addresses don't match.");
  if (newEmail === email) fail(path, "Enter a different email address from the one you signed up with.");
  if (process.env.NODE_ENV === "production" && !transactionalEmailConfigured()) fail(path, "Account verification is temporarily unavailable. Please contact support.");

  // An unverified account has no known device, so a step-up here is a wait.
  const stepUp = await passwordAttemptLimits(path, email, metadata.ipAddress);
  if (!stepUp.allowed) fail(path, rateLimitMessage(stepUp.retryAfterSeconds));
  const user = validEmail(email) ? await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, passwordHash: true, emailVerifiedAt: true, suspendedAt: true } }) : null;
  const matches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH).catch(() => false);
  // Created from a text invitation: its invitation named no address, so the person typed their own.
  const invitation = user && matches && !user.emailVerifiedAt && !user.suspendedAt
    ? await prisma.referralAccessInvite.findFirst({ where: { acceptedUserId: user.id, recipientEmail: null, recipientPhone: { not: null } }, select: { id: true } })
    : null;
  if (!user || !invitation) fail(path, EMAIL_CHANGE_REFUSED);
  await clearPasswordAttempts(email, metadata.ipAddress);
  // Past the password: one account may send its verification link to only a few addresses a day.
  await enforceRateLimit(path, { scope: "auth.email-change.account", identifiers: [user.id], limit: 3, windowMs: 24 * 60 * 60 * 1000, blockMs: 24 * 60 * 60 * 1000 });

  try {
    await prisma.$transaction(async (tx) => {
      await lockAccess(tx);
      const current = await tx.user.findUnique({ where: { id: user.id }, select: { email: true, passwordHash: true, emailVerifiedAt: true, suspendedAt: true } });
      if (!current || current.email !== email || current.passwordHash !== user.passwordHash || current.emailVerifiedAt || current.suspendedAt) throw new EmailChangeRefused();
      if (await tx.user.findUnique({ where: { email: newEmail }, select: { id: true } })) throw new EmailChangeTaken();
      const now = new Date();
      await tx.user.update({ where: { id: user.id }, data: { email: newEmail } });
      // Links belong to an address: none sent to the old one may work for whoever uses that address next.
      await invalidateAuthTokens(tx, email, "all", now);
      await invalidateAuthTokens(tx, newEmail, ACCOUNT_TOKEN_PURPOSES, now);
      await tx.adminMfaSession.deleteMany({ where: { userId: user.id } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.waitlistEntry.updateMany({ where: { email: newEmail, status: { not: "WITHDRAWN" } }, data: { status: "JOINED", joinedAt: now } });
      const workspace = await tx.workspace.findFirst({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" }, select: { id: true } });
      if (workspace) {
        await tx.auditLog.create({ data: {
          workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "account.email.change", entityType: "User", entityId: user.id, source: "verify-email",
          // Keyed hashes, not addresses: the old address was mistyped and may belong to someone else.
          beforeData: { emailHash: emailRecipientHash(email) }, afterData: { emailHash: emailRecipientHash(newEmail) },
          metadata: { accessInviteId: invitation.id, verified: false }
        } });
      }
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof EmailChangeRefused) fail(path, EMAIL_CHANGE_REFUSED);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (error instanceof EmailChangeTaken || code === "P2002") fail(path, "An account with that email already exists. Choose another address.");
    if (code === "P2034") fail(path, "Another change was processed at the same time. Please try again.");
    throw error;
  }

  const delivery = await deliverVerification(newEmail, user.name);
  const params = new URLSearchParams({ email: newEmail, sent: "1" });
  if (delivery.devToken) params.set("devToken", delivery.devToken);
  if (delivery.deliveryFailed) params.set("delivery", "failed");
  redirect(`/verify-email/pending?${params.toString()}`);
}

export async function requestPasswordResetAction(formData: FormData): Promise<void> {
  const metadata = await getRequestMetadata();
  const email = normalizedEmail(value(formData, "email"));
  const path = "/forgot-password";
  await enforceRateLimit(path, { scope: "auth.reset.request.ip", identifiers: [metadata.ipAddress], limit: 20, windowMs: 60 * 60 * 1000 });
  await enforceRateLimit(path, { scope: "auth.reset.request.email", identifiers: [email], limit: 5, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });

  if (process.env.NODE_ENV === "production" && !transactionalEmailConfigured()) {
    redirect("/forgot-password?unavailable=1");
  }

  const user = validEmail(email) ? await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } }) : null;
  let devToken: string | null = null;
  let deliveryFailed = false;
  // A silent daily limit per address, as for sign-in links; a browser that has signed in before is exempt.
  if (user && (isKnownDevice(await deviceMarker(), user.id) || !await authEmailLimitReached(user.email, "resetPassword"))) {
    const token = await issueAuthToken(user.email, AUTH_TOKEN_PURPOSES.resetPassword, env.passwordResetMinutes * 60 * 1000);
    try {
      await withEmailAttempts(1, () => sendPasswordResetEmail(user.email, user.name, token));
      if (process.env.NODE_ENV !== "production") devToken = token;
    } catch (error) {
      console.error("Password reset email delivery failed", error);
      if (process.env.NODE_ENV !== "production") devToken = token;
      else deliveryFailed = true;
    }
  }

  if (deliveryFailed) redirect("/forgot-password?delivery=failed");
  const params = new URLSearchParams({ sent: "1" });
  if (devToken) params.set("devToken", devToken);
  redirect(`/forgot-password?${params.toString()}`);
}

export async function resetPasswordAction(formData: FormData): Promise<void> {
  const metadata = await getRequestMetadata();
  const token = value(formData, "token");
  const password = value(formData, "password");
  const confirmPassword = value(formData, "confirmPassword");
  const path = `/reset-password?token=${encodeURIComponent(token)}`;
  await enforceRateLimit(path, { scope: "auth.reset.consume.ip", identifiers: [metadata.ipAddress], limit: 12, windowMs: 60 * 60 * 1000 });

  if (!token) fail("/forgot-password", "Request a new password reset link.");
  const passwordError = passwordValidationError(password);
  if (passwordError) fail(path, passwordError);
  if (password !== confirmPassword) fail(path, "The new passwords do not match.");

  const tokenRecord = await findUsableAuthToken(token, AUTH_TOKEN_PURPOSES.resetPassword);
  if (!tokenRecord) fail("/forgot-password", "That password reset link is invalid or expired. Request a new one.");
  const user = await prisma.user.findUnique({ where: { email: tokenRecord.email } });
  if (!user) fail("/forgot-password", "That password reset link is invalid or expired. Request a new one.");

  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await lockAccess(tx);
    const claim = await tx.verificationToken.updateMany({
      where: { id: tokenRecord.id, tokenHash: hashAuthToken(token), usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now }
    });
    if (claim.count !== 1) throw new Error("Password reset token has already been used.");
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    await tx.adminMfaSession.deleteMany({ where: { userId: user.id } });
    await tx.session.deleteMany({ where: { userId: user.id } });
  });

  sendPasswordChangedEmail(user.email, user.name).catch((error) => console.error("Password changed email failed", error));
  // Opening the emailed reset link proves the inbox, like a sign-in: a step-up does not block this browser.
  await rememberDevice(user.id);
  redirect("/login?reset=1");
}

export async function changePasswordAction(formData: FormData): Promise<void> {
  const { session, user } = await requireWorkspace();
  const currentPassword = value(formData, "currentPassword");
  const password = value(formData, "password");
  const confirmPassword = value(formData, "confirmPassword");
  const path = "/account";

  await enforceRateLimit(path, { scope: "auth.password.change", identifiers: [user.id], limit: 8, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 }, session);
  const hasPassword = Boolean(user.passwordHash);
  if (hasPassword && !(await bcrypt.compare(currentPassword, user.passwordHash!))) failFor(session, path, "The current password is incorrect.");
  const passwordError = passwordValidationError(password);
  if (passwordError) failFor(session, path, passwordError);
  if (password !== confirmPassword) failFor(session, path, "The new passwords do not match.");
  if (hasPassword && await bcrypt.compare(password, user.passwordHash!)) failFor(session, path, "Choose a new password that is different from the current one.");

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.adminMfaSession.deleteMany({ where: { userId: user.id } }),
    prisma.session.deleteMany({ where: { userId: user.id, id: { not: session.id } } })
  ]);
  await rotateSession(session.id, user.id);
  sendPasswordChangedEmail(user.email, user.name).catch((error) => console.error("Password changed email failed", error));
  redirect("/account?passwordChanged=1");
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const { session, user } = await requireWorkspace();
  const sessionId = value(formData, "sessionId");
  if (!sessionId || sessionId === session.id) failFor(session, "/account", "Use Sign out to end the current session.");
  await prisma.$transaction([
    prisma.adminMfaSession.deleteMany({ where: { sessionId, userId: user.id } }),
    prisma.session.deleteMany({ where: { id: sessionId, userId: user.id } })
  ]);
  redirect("/account?sessionRevoked=1");
}

export async function signOutOtherSessionsAction(): Promise<void> {
  const { session, user } = await requireWorkspace();
  const count = await destroyOtherSessions(user.id, session.id);
  redirect(`/account?sessionsClosed=${count}`);
}

export async function signOutEverywhereAction(): Promise<void> {
  const session = await requireSession();
  await destroyAllSessionsForUser(session.userId);
  await destroySession();
  redirect("/signed-out?everywhere=1");
}

export async function registerFormAction(_previous: FormResult, data: FormData): Promise<FormResult> { return recoverableFormAction(() => registerAction(data)); }

export async function loginFormAction(_previous: FormResult, data: FormData): Promise<FormResult> { return recoverableFormAction(() => loginAction(data)); }

export async function requestPasswordResetFormAction(_previous: FormResult, data: FormData): Promise<FormResult> { return recoverableFormAction(() => requestPasswordResetAction(data)); }

export async function resetPasswordFormAction(_previous: FormResult, data: FormData): Promise<FormResult> { return recoverableFormAction(() => resetPasswordAction(data)); }

export async function resendVerificationFormAction(_previous: FormResult, data: FormData): Promise<FormResult> { return recoverableFormAction(() => resendVerificationAction(data)); }

export async function requestMagicLinkFormAction(_previous: FormResult, data: FormData): Promise<FormResult> { return recoverableFormAction(() => requestMagicLinkAction(data)); }

export async function changeUnverifiedEmailFormAction(_previous: FormResult, data: FormData): Promise<FormResult> { return recoverableFormAction(() => changeUnverifiedEmailAction(data)); }
