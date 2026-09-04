"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { createSession, destroyAllSessionsForUser, destroyOtherSessions, destroySession, requireSession, requireWorkspace, rotateSession } from "@/lib/auth";
import { AUTH_TOKEN_PURPOSES, findUsableAuthToken, hashAuthToken, issueAuthToken } from "@/lib/auth-tokens";
import { sendMagicLoginEmail, sendPasswordChangedEmail, sendPasswordResetEmail, sendVerificationEmail } from "@/lib/auth-email";
import { env } from "@/lib/env";
import { passwordValidationError } from "@/lib/password-policy";
import { PilotRegistrationClosedError, registrationAllowed } from "@/lib/pilot-registration";
import { prisma } from "@/lib/prisma";
import { clearRateLimit, consumeRateLimit, releaseRateLimitAttempt } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";
import { slugify } from "@/lib/slug";
import { transactionalEmailConfigured } from "@/lib/transactional-email";

const DUMMY_PASSWORD_HASH = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function fail(path: string, message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
}

function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function rateLimitMessage(seconds: number): string {
  const minutes = Math.max(Math.ceil(seconds / 60), 1);
  return `Too many attempts. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

async function enforceRateLimit(path: string, input: Parameters<typeof consumeRateLimit>[0]): Promise<void> {
  const decision = await consumeRateLimit(input);
  if (!decision.allowed) fail(path, rateLimitMessage(decision.retryAfterSeconds));
}

async function deliverVerification(email: string, name: string): Promise<{ devToken: string | null; deliveryFailed: boolean }> {
  const token = await issueAuthToken(email, AUTH_TOKEN_PURPOSES.verifyEmail, env.emailVerificationHours * 60 * 60 * 1000);
  try {
    await sendVerificationEmail(email, name, token);
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
  const password = value(formData, "password");
  const path = "/register";

  await enforceRateLimit(path, { scope: "auth.register.ip", identifiers: [metadata.ipAddress], limit: 8, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
  await enforceRateLimit(path, { scope: "auth.register.email", identifiers: [email], limit: 3, windowMs: 24 * 60 * 60 * 1000, blockMs: 24 * 60 * 60 * 1000 });

  if (!name || name.length > 120 || !validEmail(email)) fail(path, "Enter your name and a valid email.");
  const passwordError = passwordValidationError(password);
  if (passwordError) fail(path, passwordError);
  if (env.requireEmailVerification && process.env.NODE_ENV === "production" && !transactionalEmailConfigured()) {
    fail(path, "Account verification is temporarily unavailable. Please contact support.");
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) fail("/login", "An account with that email already exists.");

  const passwordHash = await bcrypt.hash(password, 12);
  let user: { id: string; email: string; name: string };
  try {
    user = await prisma.$transaction(async (tx) => {
      if (!registrationAllowed(env.pilotMode, await tx.user.count())) {
        throw new PilotRegistrationClosedError();
      }
      const created = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          emailVerifiedAt: env.requireEmailVerification ? null : new Date()
        },
        select: { id: true, email: true, name: true }
      });
      const workspaceSlug = `${slugify(name) || "personal"}-${created.id.slice(-7)}`;
      const createdWorkspace = await tx.workspace.create({
        data: {
          name: `${name}'s business`,
          slug: workspaceSlug,
          ownerId: created.id,
          members: { create: { userId: created.id, role: "OWNER" } },
          profile: { create: {} },
          groups: {
            create: [
              { name: "Leads", description: "People who may become customers." },
              { name: "Clients", description: "Active customer relationships." },
              { name: "Referrals", description: "People introduced by your network." }
            ]
          }
        },
        select: { id: true }
      });
      await tx.userPreference.create({ data: { userId: created.id, timezone: "UTC" } });
      await tx.workspacePreference.create({ data: { workspaceId: createdWorkspace.id } });
      await tx.notificationPreference.create({ data: { workspaceId: createdWorkspace.id, userId: created.id } });
      return created;
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof PilotRegistrationClosedError) {
      fail("/login", "Owner setup is complete. Sign in with the owner account.");
    }
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "P2002") fail("/login", "An account with that email already exists.");
    if (env.pilotMode && code === "P2034" && (await prisma.user.count()) > 0) {
      fail("/login", "Owner setup is complete. Sign in with the owner account.");
    }
    throw error;
  }

  await clearRateLimit("auth.register.email", [email]);

  if (env.requireEmailVerification) {
    const delivery = await deliverVerification(user.email, user.name);
    const params = new URLSearchParams({ email: user.email, sent: "1" });
    if (delivery.devToken) params.set("devToken", delivery.devToken);
    if (delivery.deliveryFailed) params.set("delivery", "failed");
    redirect(`/verify-email/pending?${params.toString()}`);
  }

  await createSession(user.id);
  redirect("/onboarding");
}

export async function loginAction(formData: FormData): Promise<void> {
  const metadata = await getRequestMetadata();
  const email = normalizedEmail(value(formData, "email"));
  const password = value(formData, "password");
  const path = "/login";

  await enforceRateLimit(path, { scope: "auth.login.ip", identifiers: [metadata.ipAddress], limit: 30, windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000 });
  await enforceRateLimit(path, { scope: "auth.login.email", identifiers: [email], limit: 10, windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000 });

  const user = validEmail(email) ? await prisma.user.findUnique({ where: { email } }) : null;
  const matches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH).catch(() => false);
  if (!user || !matches) fail(path, "The email or password is incorrect.");

  if (env.requireEmailVerification && !user.emailVerifiedAt) {
    redirect(`/verify-email/pending?email=${encodeURIComponent(user.email)}`);
  }

  await Promise.all([
    clearRateLimit("auth.login.email", [email]),
    releaseRateLimitAttempt("auth.login.ip", [metadata.ipAddress]),
    createSession(user.id)
  ]);
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    include: { workspace: { include: { profile: true } } }
  });
  redirect(membership?.workspace.profile?.onboardingDone ? "/jumps" : "/onboarding");
}

export async function requestMagicLinkAction(formData: FormData): Promise<void> {
  const metadata = await getRequestMetadata();
  const email = normalizedEmail(value(formData, "email"));
  const path = "/login";
  await enforceRateLimit(path, { scope: "auth.magic.ip", identifiers: [metadata.ipAddress], limit: 12, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
  await enforceRateLimit(path, { scope: "auth.magic.email", identifiers: [email], limit: 5, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
  if (!validEmail(email)) fail(path, "Enter a valid email address.");
  if (!transactionalEmailConfigured()) fail(path, "Email sign-in is not configured on this server. Use your password instead.");
  const token = await issueAuthToken(email, AUTH_TOKEN_PURPOSES.magicLogin, 15 * 60_000);
  try {
    await sendMagicLoginEmail(email, token);
  } catch (error) {
    console.error("Magic sign-in email failed", error);
    fail(path, "The sign-in email could not be delivered. Try again or use your password.");
  }
  const params = new URLSearchParams({ magicSent: "1" });
  if (process.env.NODE_ENV !== "production") params.set("devToken", token);
  redirect(`/login?${params.toString()}`);
}

export async function demoLoginAction(): Promise<void> {
  const metadata = await getRequestMetadata();
  await enforceRateLimit("/login", { scope: "auth.demo.ip", identifiers: [metadata.ipAddress], limit: 20, windowMs: 15 * 60 * 1000 });
  if (!env.demoMode) fail("/login", "The demo workspace is disabled in this environment.");
  const user = await prisma.user.findUnique({ where: { email: env.demoEmail } });
  if (!user) fail("/login", "The demo workspace is not ready yet. Run the seed command and try again.");
  await createSession(user.id);
  redirect("/jumps?demo=1");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
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

export async function requestPasswordResetAction(formData: FormData): Promise<void> {
  const metadata = await getRequestMetadata();
  const email = normalizedEmail(value(formData, "email"));
  const path = "/forgot-password";
  await enforceRateLimit(path, { scope: "auth.reset.request.ip", identifiers: [metadata.ipAddress], limit: 20, windowMs: 60 * 60 * 1000 });
  await enforceRateLimit(path, { scope: "auth.reset.request.email", identifiers: [email], limit: 5, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });

  if (process.env.NODE_ENV === "production" && !transactionalEmailConfigured()) {
    redirect("/forgot-password?unavailable=1");
  }

  const user = validEmail(email) ? await prisma.user.findUnique({ where: { email }, select: { email: true, name: true } }) : null;
  let devToken: string | null = null;
  let deliveryFailed = false;
  if (user) {
    const token = await issueAuthToken(user.email, AUTH_TOKEN_PURPOSES.resetPassword, env.passwordResetMinutes * 60 * 1000);
    try {
      await sendPasswordResetEmail(user.email, user.name, token);
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
  redirect("/login?reset=1");
}

export async function changePasswordAction(formData: FormData): Promise<void> {
  const { session, user } = await requireWorkspace();
  const currentPassword = value(formData, "currentPassword");
  const password = value(formData, "password");
  const confirmPassword = value(formData, "confirmPassword");
  const path = "/account";

  await enforceRateLimit(path, { scope: "auth.password.change", identifiers: [user.id], limit: 8, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
  const hasPassword = Boolean(user.passwordHash);
  if (hasPassword && !(await bcrypt.compare(currentPassword, user.passwordHash!))) fail(path, "The current password is incorrect.");
  const passwordError = passwordValidationError(password);
  if (passwordError) fail(path, passwordError);
  if (password !== confirmPassword) fail(path, "The new passwords do not match.");
  if (hasPassword && await bcrypt.compare(password, user.passwordHash!)) fail(path, "Choose a new password that is different from the current one.");

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
  if (!sessionId || sessionId === session.id) fail("/account", "Use Sign out to end the current session.");
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
  redirect("/login?signedOutEverywhere=1");
}
