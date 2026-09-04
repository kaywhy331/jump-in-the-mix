ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE', 'APPLE');

CREATE TABLE "AuthIdentity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "AuthProvider" NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AuthIdentity_provider_providerAccountId_key" ON "AuthIdentity"("provider", "providerAccountId");
CREATE INDEX "AuthIdentity_userId_idx" ON "AuthIdentity"("userId");
CREATE INDEX "AuthIdentity_email_idx" ON "AuthIdentity"("email");

CREATE TABLE "AuthOAuthState" (
  "id" TEXT NOT NULL,
  "provider" "AuthProvider" NOT NULL,
  "stateHash" TEXT NOT NULL,
  "codeVerifier" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "returnTo" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthOAuthState_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AuthOAuthState_stateHash_key" ON "AuthOAuthState"("stateHash");
CREATE INDEX "AuthOAuthState_provider_expiresAt_idx" ON "AuthOAuthState"("provider", "expiresAt");
