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
    contacts: UNLIMITED,
    groups: UNLIMITED,
    customDateTypes: UNLIMITED,
    mixes: UNLIMITED,
    sharedMixes: 0,
    aiWizard: false,
    googleContacts: false,
    ringlessVoicemailsPerMonth: 0
  },
  PLUS: {
    contacts: UNLIMITED,
    groups: UNLIMITED,
    customDateTypes: UNLIMITED,
    mixes: UNLIMITED,
    sharedMixes: 0,
    aiWizard: false,
    googleContacts: false,
    ringlessVoicemailsPerMonth: 0
  },
  PRO: {
    contacts: 5000,
    groups: UNLIMITED,
    customDateTypes: UNLIMITED,
    mixes: UNLIMITED,
    sharedMixes: 0,
    aiWizard: false,
    googleContacts: false,
    ringlessVoicemailsPerMonth: 0
  }
};

export function formatPlanLimit(limit: number): string {
  return limit === UNLIMITED ? "Unlimited" : String(limit);
}
