"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth";
import { AUTH_TOKEN_PURPOSES, issueAuthToken } from "@/lib/auth-tokens";
import { sendVerificationEmail } from "@/lib/auth-email";
import { env } from "@/lib/env";
import { passwordValidationError } from "@/lib/password-policy";
import { prisma } from "@/lib/prisma";
import { clearRateLimit, consumeRateLimit } from "@/lib/rate-limit";
import { REFERRAL_COOKIE, generateReferralCode, normalizeReferralCode } from "@/lib/referral";
import {
  createReferralAccountInTransaction,
  createReferralAttributionInTransaction,
  findReferralInvite
} from "@/lib/referral-service";
import { getRequestMetadata } from "@/lib/request-context";
import { slugify } from "@/lib/slug";
import { transactionalEmailConfigured } from "@/lib/transactional-email";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function fail(path: string, message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
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

function prismaErrorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error ? String(error.code) : "";
}

function retryableRegistrationError(error: unknown): boolean {
  const code = prismaErrorCode(error);
  return code === "P2002" || code === "P2034";
}

export async function registerWithReferralAction(formData: FormData): Promise<void> {
  const metadata = await getRequestMetadata();
  const store = await cookies();
  const name = value(formData, "name");
  const email = normalizedEmail(value(formData, "email"));
  const password = value(formData, "password");
  const confirmPassword = value(formData, "confirmPassword");
  const referralCode = normalizeReferralCode(value(formData, "referralCode") || store.get(REFERRAL_COOKIE)?.value);
  const plan = ["plus", "pro"].includes(value(formData, "plan")) ? value(formData, "plan") : "free";
  const period = value(formData, "period") === "monthly" ? "monthly" : "annual";
  const intent = plan === "free" ? "" : `${plan}:${period}`;
  const pathParams = new URLSearchParams();
  if (referralCode) pathParams.set("ref", referralCode);
  if (plan !== "free") { pathParams.set("plan", plan); pathParams.set("period", period); }
  const path = `/register${pathParams.size ? `?${pathParams}` : ""}`;

  await enforceRateLimit(path, { scope: "auth.register.ip", identifiers: [metadata.ipAddress], limit: 8, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
  await enforceRateLimit(path, { scope: "auth.register.email", identifiers: [email], limit: 3, windowMs: 24 * 60 * 60 * 1000, blockMs: 24 * 60 * 60 * 1000 });

  if (!name || name.length > 120 || !validEmail(email)) fail(path, "Enter your name and a valid email.");
  if (password !== confirmPassword) fail(path, "The passwords do not match.");
  const passwordError = passwordValidationError(password);
  if (passwordError) fail(path, passwordError);
  if (env.requireEmailVerification && process.env.NODE_ENV === "production" && !transactionalEmailConfigured()) {
    fail(path, "Account verification is temporarily unavailable. Please contact support.");
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) fail("/login", "An account with that email already exists.");

  const invite = referralCode ? await findReferralInvite(referralCode) : null;
  if (referralCode && !invite) fail("/register", "That referral invitation is unavailable. Ask your friend for a new link or continue without it.");
  if (invite?.ownerEmail.toLowerCase() === email) fail("/register", "You cannot use your own workspace referral invitation.");

  const passwordHash = await bcrypt.hash(password, 12);
  let user: { id: string; email: string; name: string } | null = null;
  for (let attempt = 0; attempt < 4 && !user; attempt += 1) {
    try {
      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            name,
            passwordHash,
            emailVerifiedAt: env.requireEmailVerification ? null : new Date()
          },
          select: { id: true, email: true, name: true }
        });
        const workspaceSlug = `${slugify(name) || "workspace"}-${created.id.slice(-7)}`;
        const workspace = await tx.workspace.create({
          data: {
            name: `${name}'s Workspace`,
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
        await createReferralAccountInTransaction(tx, workspace.id, generateReferralCode());
        if (invite) {
          await createReferralAttributionInTransaction(tx, {
            code: invite.code,
            referrerWorkspaceId: invite.workspaceId,
            referredWorkspaceId: workspace.id,
            qualifyImmediately: !env.requireEmailVerification
          });
        }
        return created;
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!retryableRegistrationError(error) || attempt === 3) {
        if (prismaErrorCode(error) === "P2002") {
          const existingAfterRace = await prisma.user.findUnique({ where: { email }, select: { id: true } });
          if (existingAfterRace) fail("/login", "An account with that email already exists.");
        }
        throw error;
      }
    }
  }
  if (!user) throw new Error("The account could not be created.");

  store.delete(REFERRAL_COOKIE);
  if (intent) store.set("jitm_plan_intent", intent, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 24 * 60 * 60, path: "/" });
  await clearRateLimit("auth.register.email", [email]);

  if (env.requireEmailVerification) {
    const delivery = await deliverVerification(user.email, user.name);
    const params = new URLSearchParams({ email: user.email, sent: "1" });
    if (delivery.devToken) params.set("devToken", delivery.devToken);
    if (delivery.deliveryFailed) params.set("delivery", "failed");
    redirect(`/verify-email/pending?${params.toString()}`);
  }

  await createSession(user.id);
  redirect(invite ? "/onboarding?referral=qualified" : "/onboarding");
}
