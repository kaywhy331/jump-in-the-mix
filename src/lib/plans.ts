import type { PlanTier } from "@/generated/prisma/client";
import { PLAN_CATALOG, UNLIMITED_PLAN_LIMIT, type PlanLimits } from "@/lib/plan-catalog";

export type { PlanLimits } from "@/lib/plan-catalog";

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  FREE: PLAN_CATALOG.FREE.limits,
  PLUS: PLAN_CATALOG.PLUS.limits,
  PRO: PLAN_CATALOG.PRO.limits
};

export function formatPlanLimit(limit: number): string {
  return limit === UNLIMITED_PLAN_LIMIT ? "Unlimited" : limit.toLocaleString("en-US");
}
