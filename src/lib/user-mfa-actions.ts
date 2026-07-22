"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import {
  destroyOtherSessions,
  getPendingUserMfaSession,
  requireWorkspace
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";
import type { UserMfaActionState } from "@/lib/user-mfa-action-state";
import {
  UserMfaError,
  consumeUserMfaCode,
  disableUserMfa,
  enableUserMfaCredential,
  markCurrentSessionVerifiedAfterEnrollment,
  markUserMfaSessionVerified
} from "@/lib/user-mfa";

function value(formData: FormData, key: string, maximum = 500): string {
  return String(formData.get(key) ?? "").trim().slice(0, maximum);
}

async function rateLimit(userId: string, scope: string): Promise<string | null> {
  const metadata = await getRequestMetadata();
  const decision = await consumeRateLimit({
    scope,
    identifiers: [userId, metadata.ipAddress],
    limit: 10,
    windowMs: 15 * 60 * 1000,
    blockMs: 30 * 60 * 1000
  });
  return decision.allowed
    ? null
    : `Too many verification attempts. Try again in about ${Math.max(Math.ceil(decision.retryAfterSeconds / 60), 1)} minute(s).`;
}

async function audit(input: { workspaceId: string | null; userId: string; action: string; method?: string }) {
  if (!input.workspaceId) return;
  await prisma.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorType: "USER",
      actorUserId: input.userId,
      action: input.action,
      entityType: "UserMfaCredential",
      entityId: input.userId,
      source: "account.security.mfa",
      metadata: input.method ? { method: input.method } : undefined
    }
  });
}

async function destinationAfterLogin(userId: string): Promise<string> {
  const [preference, memberships] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId }, select: { activeWorkspaceId: true } }),
    prisma.workspaceMember.findMany({
      where: { userId },
      include: { workspace: { include: { profile: true } } },
      orderBy: { createdAt: "asc" }
    })
  ]);
  const membership = memberships.find((item) => item.workspaceId === preference?.activeWorkspaceId) ?? memberships[0];
  return membership?.workspace.profile?.onboardingDone ? "/jumps" : "/onboarding";
}

export async function enableUserMfaAction(
  _previousState: UserMfaActionState,
  formData: FormData
): Promise<UserMfaActionState> {
  const { session, user, workspace, impersonation } = await requireWorkspace();
  if (impersonation) return { status: "error", message: "Administrator support sessions are view-only." };
  const limited = await rateLimit(user.id, "auth.user-mfa.enable");
  if (limited) return { status: "error", message: limited };
  const currentPassword = value(formData, "currentPassword", 72);
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return { status: "error", message: "The current password is incorrect." };
  }
  try {
    const recoveryCodes = await enableUserMfaCredential(user.id, value(formData, "code", 40));
    await markCurrentSessionVerifiedAfterEnrollment(session.id, user.id);
    await destroyOtherSessions(user.id, session.id);
    await audit({ workspaceId: workspace.id, userId: user.id, action: "user.mfa.enable" });
    return { status: "enabled", recoveryCodes };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "MFA could not be enabled." };
  }
}

export async function verifyUserMfaAction(
  _previousState: UserMfaActionState,
  formData: FormData
): Promise<UserMfaActionState> {
  const pending = await getPendingUserMfaSession();
  if (!pending) return { status: "error", message: "The MFA challenge expired. Sign in again." };
  const limited = await rateLimit(pending.user.id, "auth.user-mfa.verify");
  if (limited) return { status: "error", message: limited };
  try {
    const method = await consumeUserMfaCode(pending.user.id, value(formData, "code", 40));
    await markUserMfaSessionVerified(pending.session.id, pending.user.id);
    const membership = await prisma.workspaceMember.findFirst({ where: { userId: pending.user.id }, select: { workspaceId: true }, orderBy: { createdAt: "asc" } });
    await audit({ workspaceId: membership?.workspaceId ?? null, userId: pending.user.id, action: "user.mfa.verify", method });
    return { status: "verified", redirectTo: await destinationAfterLogin(pending.user.id) };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof UserMfaError || error instanceof Error ? error.message : "MFA verification failed."
    };
  }
}

export async function disableUserMfaAction(formData: FormData): Promise<void> {
  const { session, user, workspace, impersonation } = await requireWorkspace();
  if (impersonation) redirect("/account/security/mfa?error=View-only+support+sessions+cannot+change+MFA.");
  const limited = await rateLimit(user.id, "auth.user-mfa.disable");
  if (limited) redirect(`/account/security/mfa?error=${encodeURIComponent(limited)}`);
  const currentPassword = value(formData, "currentPassword", 72);
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    redirect("/account/security/mfa?error=The+current+password+is+incorrect.");
  }
  try {
    await consumeUserMfaCode(user.id, value(formData, "code", 40));
    await disableUserMfa(user.id);
    await destroyOtherSessions(user.id, session.id);
    await audit({ workspaceId: workspace.id, userId: user.id, action: "user.mfa.disable" });
  } catch (error) {
    redirect(`/account/security/mfa?error=${encodeURIComponent(error instanceof Error ? error.message : "MFA could not be disabled.")}`);
  }
  redirect("/account/security/mfa?disabled=1");
}
