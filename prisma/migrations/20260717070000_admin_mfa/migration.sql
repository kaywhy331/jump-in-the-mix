CREATE TABLE "AdminMfaCredential" (
  "userId" TEXT NOT NULL,
  "secretCiphertext" TEXT NOT NULL,
  "recoveryCodeHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "enabledAt" TIMESTAMP(3),
  "lastUsedCounter" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminMfaCredential_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "AdminMfaSession" (
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminMfaSession_pkey" PRIMARY KEY ("sessionId")
);

CREATE INDEX "AdminMfaCredential_enabledAt_idx" ON "AdminMfaCredential"("enabledAt");
CREATE INDEX "AdminMfaSession_userId_expiresAt_idx" ON "AdminMfaSession"("userId", "expiresAt");
CREATE INDEX "AdminMfaSession_expiresAt_idx" ON "AdminMfaSession"("expiresAt");
