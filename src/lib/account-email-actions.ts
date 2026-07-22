"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hashAuthToken } from "@/lib/auth-tokens";
import { requireWorkspace } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";
import { escapeHtml, sendTransactionalEmail } from "@/lib/transactional-email";

const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000;

function value(formData: FormData, key: string, maximum = 500): string {
  return String(formData.get(key) ?? "").trim().slice(0, maximum);
}

function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

export async function requestEmailChangeAction(formData: FormData): Promise<void> {
  const { user, workspace, impersonation } = await requireWorkspace();
  const path = "/account/security/email";
  if (impersonation) fail(path, "Email settings are unavailable during a view-only support session.");
  const metadata = await getRequestMetadata();
  const decision = await consumeRateLimit({ scope: "auth.email-change.request", identifiers: [user.id, metadata.ipAddress], limit: 5, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
  if (!decision.allowed) fail(path, "Too many email-change requests. Try again later.");
  const currentPassword = value(formData, "currentPassword", 72);
  const email = value(formData, "email", 254).toLowerCase();
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) fail(path, "The current password is incorrect.");
  if (!validEmail(email)) fail(path, "Enter a valid new email address.");
  if (email === user.email.toLowerCase()) fail(path, "Enter an email address different from the current one.");
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) fail(path, "That email address already belongs to another account.");
  const rawToken = randomBytes(32).toString("base64url");
  const purpose = `email-change:${user.id}`;
  const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TTL_MS);
  await prisma.$transaction(async (tx) => {
    await tx.verificationToken.updateMany({ where: { purpose, usedAt: null }, data: { usedAt: new Date() } });
    await tx.verificationToken.create({ data: { email, tokenHash: hashAuthToken(rawToken), purpose, expiresAt } });
    await tx.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "user.email-change.request", entityType: "User", entityId: user.id, source: "account.security.email", metadata: { newEmail: email, expiresAt: expiresAt.toISOString() } } });
  });
  const confirmUrl = new URL("/change-email", env.appUrl);
  confirmUrl.searchParams.set("token", rawToken);
  try {
    await sendTransactionalEmail({
      to: email,
      subject: "Confirm your Jump in the Mix email",
      text: `Confirm this email address within one hour: ${confirmUrl.toString()}`,
      html: `<p>Confirm this address for your Jump in the Mix account.</p><p><a href="${escapeHtml(confirmUrl.toString())}">Confirm email address</a></p><p>This one-time link expires in one hour.</p>`,
      idempotencyKey: `email-change-${hashAuthToken(rawToken).slice(0, 32)}`
    });
  } catch {
    await prisma.verificationToken.updateMany({ where: { tokenHash: hashAuthToken(rawToken), usedAt: null }, data: { usedAt: new Date() } });
    fail(path, "The confirmation email could not be delivered. Check email delivery configuration and try again.");
  }
  const params = new URLSearchParams({ requested: "1", email });
  if (process.env.NODE_ENV !== "production") params.set("devToken", rawToken);
  redirect(`${path}?${params.toString()}`);
}

export async function confirmEmailChangeAction(formData: FormData): Promise<void> {
  const rawToken = value(formData, "token", 500);
  const tokenHash = hashAuthToken(rawToken);
  const now = new Date();
  const token = rawToken ? await prisma.verificationToken.findFirst({ where: { tokenHash, purpose: { startsWith: "email-change:" }, usedAt: null, expiresAt: { gt: now } } }) : null;
  if (!token) fail("/change-email", "That email confirmation link is invalid or expired.");
  const userId = token.purpose.slice("email-change:".length);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, memberships: { select: { workspaceId: true }, orderBy: { createdAt: "asc" }, take: 1 } } });
  if (!user) fail("/change-email", "That account is no longer available.");
  const collision = await prisma.user.findUnique({ where: { email: token.email }, select: { id: true } });
  if (collision && collision.id !== user.id) fail("/change-email", "That email address now belongs to another account.");
  await prisma.$transaction(async (tx) => {
    const claim = await tx.verificationToken.updateMany({ where: { id: token.id, tokenHash, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (claim.count !== 1) throw new Error("The confirmation link was already used.");
    await tx.user.update({ where: { id: user.id }, data: { email: token.email, emailVerifiedAt: now } });
    await tx.adminMfaSession.deleteMany({ where: { userId: user.id } });
    await tx.userMfaSession.deleteMany({ where: { userId: user.id } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    if (user.memberships[0]) await tx.auditLog.create({ data: { workspaceId: user.memberships[0].workspaceId, actorType: "USER", actorUserId: user.id, action: "user.email-change.confirm", entityType: "User", entityId: user.id, source: "account.security.email", beforeData: { email: user.email }, afterData: { email: token.email } } });
  });
  const store = await cookies();
  store.delete(env.cookieName);
  store.delete("jitm_mfa_pending");
  await Promise.allSettled([
    sendTransactionalEmail({ to: user.email, subject: "Your Jump in the Mix email changed", text: `Your account email was changed to ${token.email}. If you did not do this, contact support immediately.`, html: `<p>Your account email was changed to <strong>${escapeHtml(token.email)}</strong>.</p><p>If you did not do this, contact support immediately.</p>`, idempotencyKey: `email-changed-old-${token.id}` }),
    sendTransactionalEmail({ to: token.email, subject: "Your Jump in the Mix email is confirmed", text: "Your new email is confirmed. Sign in again to continue.", html: "<p>Your new email is confirmed. Sign in again to continue.</p>", idempotencyKey: `email-changed-new-${token.id}` })
  ]);
  redirect("/login?emailChanged=1");
}
