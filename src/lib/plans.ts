import type { PlanTier } from "@/generated/prisma/client";

export type PlanLimits = {
  contacts: number;
  groups: number;
  customDateTypes: number;
  mixes: number;
  sharedMixes: number;
  aiWizard: boolean;
  googleContacts: boolean;
  ringlessVoicemailsPerMonth: number;
};

const UNLIMITED = Number.MAX_SAFE_INTEGER;

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  FREE: {
    contacts: 100,
    groups: 3,
    customDateTypes: 3,
    mixes: 3,
    sharedMixes: 0,
    aiWizard: false,
    googleContacts: false,
    ringlessVoicemailsPerMonth: 0
  },
  PLUS: {
    contacts: 1000,
    groups: 10,
    customDateTypes: 10,
    mixes: 10,
    sharedMixes: 3,
    aiWizard: true,
    googleContacts: true,
    ringlessVoicemailsPerMonth: 0
  },
  PRO: {
    contacts: 5000,
    groups: UNLIMITED,
    customDateTypes: UNLIMITED,
    mixes: UNLIMITED,
    sharedMixes: 10,
    aiWizard: true,
    googleContacts: true,
    ringlessVoicemailsPerMonth: 50
  }
};

export function formatPlanLimit(limit: number): string {
  return limit === UNLIMITED ? "Unlimited" : String(limit);
}
