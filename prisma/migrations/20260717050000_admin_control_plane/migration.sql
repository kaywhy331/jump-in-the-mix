CREATE TABLE "PlatformSetting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "value" JSONB NOT NULL,
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformSetting_key_key" ON "PlatformSetting"("key");
CREATE INDEX "PlatformSetting_category_key_idx" ON "PlatformSetting"("category", "key");
CREATE INDEX "PlatformSetting_isPublic_key_idx" ON "PlatformSetting"("isPublic", "key");
