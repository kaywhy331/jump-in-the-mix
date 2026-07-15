import type { PlanTier } from "@/generated/prisma/client";

export const PLAN_LIMITS: Record<PlanTier, { contacts: number; mixes: number; aiWizard: boolean }> = {
  FREE: { contacts: 100, mixes: 2, aiWizard: false },
  PLUS: { contacts: 1000, mixes: 25, aiWizard: true },
  PRO: { contacts: 5000, mixes: 100, aiWizard: true }
};
