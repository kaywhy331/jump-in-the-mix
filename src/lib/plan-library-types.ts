import type { Channel, MixTriggerMode } from "@/generated/prisma/client";
import type { MIX_TEMPLATE_INDUSTRIES } from "@/lib/shared-mix";

export type ReadyMadePlanStep = {
  name: string;
  channel: Channel;
  dayOffset: number;
  sendTimeMinutes: number;
  subject?: string;
  body?: string;
  script?: string;
};

export type ReadyMadePlan = {
  id: string;
  title: string;
  description: string;
  category: string;
  industry: (typeof MIX_TEMPLATE_INDUSTRIES)[number];
  framework: string;
  triggerMode: MixTriggerMode;
  dateTypeName: string | null;
  dateTypeSlug: string | null;
  durationDays: number;
  featured: boolean;
  steps: ReadyMadePlanStep[];
};
