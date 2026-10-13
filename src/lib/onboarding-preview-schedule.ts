import type { Channel } from "@/generated/prisma/client";
import { zonedDateTimeToUtc } from "@/lib/jump-schedule";
import { isValidTimezone } from "@/lib/mix-broadcast";
import { DEFAULT_PERSONAL_SCHEDULING, personalSchedulingRules, type PersonalSchedulingRule } from "@/lib/personal-scheduling";
import type { ReadyMadePlan } from "@/lib/plan-library-types";
import { prisma } from "@/lib/prisma";
import { previewSchedule } from "@/lib/schedule-preview";
import { isStarterName, reusableStarterMixWhere } from "@/lib/starter-mix";
import type { BoundStepTiming } from "@/lib/step-timing";

export type OnboardingPreviewStep = { name: string; channel: Channel; subject: string | null; body: string | null; script: string | null; at: string | null };
export type OnboardingPreview = { title: string; steps: OnboardingPreviewStep[] };

/**
 * When each Beat comes due for a follow-up dated `date` (YYYY-MM-DD) in `timezone`: the scheduler's own timing, under the
 * saved weekend rule, quiet hours and working days (`previewSchedule`). Without a valid date or timezone there are no times.
 */
export function onboardingPreviewTimes(steps: BoundStepTiming[], date: string, timezone: string, rules: PersonalSchedulingRule): (string | null)[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match || !isValidTimezone(timezone)) return steps.map(() => null);
  // Onboarding saves the follow-up as that day in the chosen timezone (onboarding-actions.ts); the count starts from it.
  const start = zonedDateTimeToUtc({ year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }, 12 * 60, timezone);
  return previewSchedule(steps, start, start, timezone, rules, false).map(item => item.at);
}

/**
 * The first follow-up as onboarding will start it (JITM-09 §2.20, D73): the workspace's starter Mix of that title, which
 * onboarding reuses (`ensureStarterMix`), or else the library's, with each Beat dated by the scheduler.
 */
export async function onboardingPreview(workspaceId: string, plan: ReadyMadePlan, date: string, timezone: string): Promise<OnboardingPreview> {
  const [reusable, rules] = await Promise.all([
    prisma.mix.findMany({
      where: reusableStarterMixWhere(workspaceId, plan.title),
      orderBy: { createdAt: "asc" },
      select: { name: true, steps: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { dayOffset: true, sendTimeMinutes: true, plannedAt: true, anchor: true, offsetMinutes: true, stepVersion: { select: { subject: true, body: true, script: true, stepTemplate: { select: { name: true, channel: true } } } } } } }
    }),
    personalSchedulingRules([workspaceId]).then(saved => saved.get(workspaceId) ?? DEFAULT_PERSONAL_SCHEDULING)
  ]);
  // The one `ensureStarterMix` would reuse: the oldest that is the title or the title numbered apart (D94).
  const existing = reusable.find(mix => isStarterName(mix.name, plan.title));
  const steps: (Omit<OnboardingPreviewStep, "at"> & { timing: BoundStepTiming })[] = existing
    ? existing.steps.map(({ stepVersion: { stepTemplate, ...wording }, ...timing }) => ({ name: stepTemplate.name.replace(`${existing.name} — `, ""), channel: stepTemplate.channel, ...wording, timing }))
    : plan.steps.map(step => ({ name: step.name, channel: step.channel, subject: step.subject ?? null, body: step.body ?? null, script: step.script ?? null, timing: { anchor: "CALENDAR_DAY", offsetMinutes: null, plannedAt: null, dayOffset: step.dayOffset, sendTimeMinutes: step.sendTimeMinutes } }));
  const times = onboardingPreviewTimes(steps.map(step => step.timing), date, timezone, rules);
  return { title: plan.title, steps: steps.map(({ name, channel, subject, body, script }, index) => ({ name, channel, subject, body, script, at: times[index] })) };
}
