"use server";

import bcrypt from "bcryptjs";
import {
  AdminMfaError,
  consumeAdminMfaCode,
  enableAdminMfaCredential,
  markAdminMfaSessionVerified
} from "@/lib/admin-mfa";
import type { AdminMfaActionState } from "@/lib/admin-mfa-action-state";
import { requirePlatformAdminIdentity } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";

function value(formData: FormData, key: string, maxLength = 200): string {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

function safeAdminReturnTo(raw: string): string {
  if (!raw.startsWith("/admin") || raw.startsWith("//")) return "/admin";
  return raw;
}

async function enforceAdminMfaRateLimit(userId: string, scope: string): Promise<string | null> {
  const metadata = await getRequestMetadata();
  const decision = await consumeRateLimit({
    scope,
    identifiers: [userId, metadata.ipAddress],
    limit: 10,
    windowMs: 15 * 60 * 1000,
    blockMs: 30 * 60 * 1000
  });
  if (decision.allowed) return null;
  return `Too many administrator verification attempts. Try again in about ${Math.max(Math.ceil(decision.retryAfterSeconds / 60), 1)} minute(s).`;
}

async function auditAdminMfa(input: {
  userId: string;
  workspaceId: string | null;
  action: string;
  method?: string;
}): Promise<void> {
  if (!input.workspaceId) return;
  await prisma.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorType: "ADMIN",
      actorUserId: input.userId,
      action: input.action,
      entityType: "AdminMfaCredential",
      entityId: input.userId,
      source: "account.admin-mfa",
      metadata: input.method ? { method: input.method } : undefined
    }
  });
}

export async function enableAdminMfaAction(
  _previousState: AdminMfaActionState,
  formData: FormData
): Promise<AdminMfaActionState> {
  const { session, user } = await requirePlatformAdminIdentity();
  const rateLimitError = await enforceAdminMfaRateLimit(user.id, "auth.admin-mfa.enable");
  if (rateLimitError) return { status: "error", message: rateLimitError };

  const currentPassword = value(formData, "currentPassword", 72);
  const code = value(formData, "code", 40);
  if (!user.passwordHash) {
    return { status: "error", message: "Set an account password before enabling administrator MFA." };
  }
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    return { status: "error", message: "The current password is incorrect." };
  }

  try {
    const recoveryCodes = await enableAdminMfaCredential(user.id, code);
    await markAdminMfaSessionVerified(session.id, user.id);
    await auditAdminMfa({
      userId: user.id,
      workspaceId: user.memberships[0]?.workspaceId ?? null,
      action: "admin.mfa.enable"
    });
    return { status: "enabled", recoveryCodes };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof AdminMfaError || error instanceof Error
        ? error.message
        : "Administrator MFA could not be enabled."
    };
  }
}

export async function verifyAdminMfaAction(
  _previousState: AdminMfaActionState,
  formData: FormData
): Promise<AdminMfaActionState> {
  const { session, user } = await requirePlatformAdminIdentity();
  const rateLimitError = await enforceAdminMfaRateLimit(user.id, "auth.admin-mfa.verify");
  if (rateLimitError) return { status: "error", message: rateLimitError };

  const code = value(formData, "code", 40);
  const redirectTo = safeAdminReturnTo(value(formData, "returnTo", 500));
  try {
    const method = await consumeAdminMfaCode(user.id, code);
    await markAdminMfaSessionVerified(session.id, user.id);
    await auditAdminMfa({
      userId: user.id,
      workspaceId: user.memberships[0]?.workspaceId ?? null,
      action: "admin.mfa.verify",
      method
    });
    return { status: "verified", redirectTo };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof AdminMfaError || error instanceof Error
        ? error.message
        : "Administrator verification failed."
    };
  }
}
