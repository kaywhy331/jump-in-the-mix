-- Slice 3: one follow-up, channel alternatives. A step version keeps its primary channel's
-- wording; a variant row adds wording for another family, and a follow-up records the family
-- the owner chose on Today. Both are additive; existing single-channel plans are unchanged.
CREATE TABLE "StepVersionVariant" (
    "stepVersionId" TEXT NOT NULL,
    "family" "PreparationFamily" NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "script" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StepVersionVariant_pkey" PRIMARY KEY ("stepVersionId","family")
);

ALTER TABLE "StepVersionVariant" ADD CONSTRAINT "StepVersionVariant_stepVersionId_fkey" FOREIGN KEY ("stepVersionId") REFERENCES "StepVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Jump" ADD COLUMN "selectedFamily" "PreparationFamily";
