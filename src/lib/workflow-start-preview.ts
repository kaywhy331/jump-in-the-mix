import { prisma } from "@/lib/prisma";
import { assertMixStartEligible } from "@/lib/mix-start-eligibility";
import { readWorkflowDefinition } from "@/lib/mix-workflow";
import { workflowCalendarStepTime } from "@/lib/workflow-scheduling";
import { DEFAULT_PERSONAL_SCHEDULING } from "@/lib/personal-scheduling";
import { UserFacingError } from "@/lib/user-facing-error";

export type WorkflowStartPreview = { savedInstanceId?: string; revision: number; timezone: string; contactName: string; mixName: string; steps: Array<{ name: string; dueAt: string | null; note: string }>; automatic: boolean };
export async function previewWorkflowStart(workspaceId: string, contactId: string, mixId: string, now = new Date(), requestId?: string): Promise<WorkflowStartPreview> {
  return prisma.$transaction(async db => {
    if (requestId) {
      const saved = await db.mixWorkflowInstance.findUnique({ where: { workspaceId_admissionKey: { workspaceId, admissionKey: `manual:${contactId}:${mixId}:${requestId}` } }, include: { contact: { select: { displayName: true } } } });
      if (saved) return { savedInstanceId: saved.id, revision: 0, timezone: "UTC", contactName: saved.contact.displayName, mixName: saved.label, steps: [], automatic: false };
    }
    await assertMixStartEligible(db, workspaceId, contactId, mixId);
    const definition = await readWorkflowDefinition(db, workspaceId), mix = definition.mixes.find(item => item.id === mixId)!;
    const [workspace, contact, preference, automation, busy] = await Promise.all([
      db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { ownerId: true } }),
      db.contact.findUniqueOrThrow({ where: { id: contactId }, select: { displayName: true } }),
      db.workspacePreference.findUnique({ where: { workspaceId } }),
      db.automationPreference.findUnique({ where: { workspaceId } }),
      db.calendarEntry.findMany({ where: { workspaceId, canceledAt: null, endsAt: { gte: new Date(now.getTime() - 2 * 86400000) }, startsAt: { lte: new Date(now.getTime() + 800 * 86400000) } }, select: { startsAt: true, endsAt: true, kind: true } })
    ]);
    const timezone = (await db.userPreference.findUnique({ where: { userId: workspace.ownerId }, select: { timezone: true } }))?.timezone ?? "UTC";
    const steps = mix.steps.filter(step => !definition.gatedStepIds.includes(step.id));
    if (!steps.length) throw new UserFacingError("This Mix has no starting Beats. Review its connections before starting it.");
    return { revision: definition.revision, timezone, contactName: contact.displayName, mixName: mix.name, automatic: Boolean(automation?.enabled), steps: steps.map(step => ({ name: step.name, dueAt: step.anchor === "CALENDAR_DAY" ? workflowCalendarStepTime(step, now, timezone, preference ?? DEFAULT_PERSONAL_SCHEDULING, busy).toISOString() : null, note: step.anchor === "CALENDAR_DAY" ? "Due for review; sending settings and contact eligibility still apply." : "Waits for an appointment. Link its date from this work after starting." })) };
  });
}
