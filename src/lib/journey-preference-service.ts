import type { Prisma } from "@/generated/prisma/client";
import { validateJourneySetup, type JourneySetupValues } from "@/lib/journey-preferences";

export async function saveJourneySetup(db: Prisma.TransactionClient, workspaceId: string, userId: string, setup: JourneySetupValues) {
  const error = validateJourneySetup(setup); if (error) throw new Error(error);
  const values = { journeyPreferences: { ...setup.preferences, reviewedAt: new Date().toISOString() }, defaultFollowUpMinutes: setup.defaultFollowUpMinutes,
    quietHoursStart: setup.quietHoursStart, quietHoursEnd: setup.quietHoursEnd, appointmentBufferMinutes: setup.appointmentBufferMinutes,
    // The explicit working-day selection is authoritative after this review.
    weekendScheduling: "KEEP" as const };
  await db.workspacePreference.upsert({ where: { workspaceId }, create: { workspaceId, ...values }, update: values });
  await db.userPreference.upsert({ where: { userId }, create: { userId, timezone: setup.timezone }, update: { timezone: setup.timezone } });
  await db.job.create({ data: { workspaceId, task: "generate-jumps", payload: {} } });
}
