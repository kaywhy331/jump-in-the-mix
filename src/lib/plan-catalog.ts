import type { PlanTier } from "@/generated/prisma/client";

export const UNLIMITED_PLAN_LIMIT = Number.MAX_SAFE_INTEGER;

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

export type PlanCatalogEntry = {
  tier: PlanTier;
  name: string;
  description: string;
  monthlyAmountCents: number;
  annualAmountCents: number;
  popular?: boolean;
  limits: PlanLimits;
  features: string[];
};

export const PLAN_CATALOG: Record<PlanTier, PlanCatalogEntry> = {
  FREE: {
    tier: "FREE",
    name: "Free",
    description: "For organizing a focused personal network.",
    monthlyAmountCents: 0,
    annualAmountCents: 0,
    limits: {
      contacts: 100,
      groups: 3,
      customDateTypes: 3,
      mixes: 3,
      sharedMixes: 0,
      aiWizard: false,
      googleContacts: false,
      ringlessVoicemailsPerMonth: 0
    },
    features: [
      "100 active Contacts",
      "3 Contact Groups",
      "3 custom Important Date Types",
      "3 active Mixes",
      "Browse Community Mixes"
    ]
  },
  PLUS: {
    tier: "PLUS",
    name: "Plus",
    description: "For entrepreneurs building a consistent relationship routine.",
    monthlyAmountCents: 1500,
    annualAmountCents: 14400,
    popular: true,
    limits: {
      contacts: 1000,
      groups: 10,
      customDateTypes: 10,
      mixes: 10,
      sharedMixes: 3,
      aiWizard: true,
      googleContacts: true,
      ringlessVoicemailsPerMonth: 0
    },
    features: [
      "1,000 active Contacts",
      "10 Contact Groups",
      "10 custom Important Date Types",
      "10 active Mixes",
      "AI Mix Wizard",
      "Google Contacts sync",
      "Share up to 3 Community Mixes"
    ]
  },
  PRO: {
    tier: "PRO",
    name: "Pro",
    description: "For growing businesses managing a broader relationship network.",
    monthlyAmountCents: 1800,
    annualAmountCents: 18000,
    limits: {
      contacts: 5000,
      groups: UNLIMITED_PLAN_LIMIT,
      customDateTypes: UNLIMITED_PLAN_LIMIT,
      mixes: UNLIMITED_PLAN_LIMIT,
      sharedMixes: 10,
      aiWizard: true,
      googleContacts: true,
      ringlessVoicemailsPerMonth: 50
    },
    features: [
      "5,000 active Contacts",
      "Unlimited Contact Groups",
      "Unlimited custom Important Date Types",
      "Unlimited active Mixes",
      "AI Mix Wizard",
      "Google Contacts sync",
      "Share up to 10 Community Mixes",
      "50 Ringless Voicemail scripts per month"
    ]
  }
};

export function annualMonthlyEquivalentCents(entry: PlanCatalogEntry): number {
  return entry.annualAmountCents ? Math.round(entry.annualAmountCents / 12) : 0;
}

export function annualSavingsCents(entry: PlanCatalogEntry): number {
  return Math.max(entry.monthlyAmountCents * 12 - entry.annualAmountCents, 0);
}
