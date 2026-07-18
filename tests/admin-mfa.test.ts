import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  adminMfaCredentialStatus,
  adminMfaSessionIsVerified,
  clearAdminMfaSession,
  consumeAdminMfaCode,
  enableAdminMfaCredential,
  markAdminMfaSessionVerified,
  prepareAdminMfaEnrollment
} from "../src/lib/admin-mfa";
import { prisma } from "../src/lib/prisma";
import { generateTotpCode } from "../src/lib/totp";

describe.sequential("administrator MFA", () => {
  const suffix = randomUUID();
  const userId = `admin-mfa-${suffix}`;
  const sessionId = `admin-mfa-session-${suffix}`;

  afterAll(async () => {
    await prisma.adminMfaSession.deleteMany({ where: { userId } });
    await prisma.adminMfaCredential.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("matches the RFC 6238 SHA-1 test vector", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(generateTotpCode(secret, 59_000, { digits: 8 })).toBe("94287082");
  });

  it("enrolls, prevents TOTP replay, consumes a recovery code once, and marks one session verified", async () => {
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@example.com`,
        name: "MFA Test Admin",
        passwordHash: "test-only",
        emailVerifiedAt: new Date(),
        isPlatformAdmin: true
      }
    });

    const enrollment = await prepareAdminMfaEnrollment(userId);
    const code = generateTotpCode(enrollment.secret);
    const recoveryCodes = await enableAdminMfaCredential(userId, code);
    expect(recoveryCodes).toHaveLength(10);

    const status = await adminMfaCredentialStatus(userId);
    expect(status.enabledAt).toBeInstanceOf(Date);
    expect(status.recoveryCodesRemaining).toBe(10);

    await expect(consumeAdminMfaCode(userId, code)).rejects.toThrow(/already used|not accepted/i);
    await expect(consumeAdminMfaCode(userId, recoveryCodes[0])).resolves.toBe("recovery");
    await expect(consumeAdminMfaCode(userId, recoveryCodes[0])).rejects.toThrow(/already used|not accepted/i);
    expect((await adminMfaCredentialStatus(userId)).recoveryCodesRemaining).toBe(9);

    await markAdminMfaSessionVerified(sessionId, userId);
    await expect(adminMfaSessionIsVerified(sessionId, userId)).resolves.toBe(true);
    await clearAdminMfaSession(sessionId);
    await expect(adminMfaSessionIsVerified(sessionId, userId)).resolves.toBe(false);
  });
});
