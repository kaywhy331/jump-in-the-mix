import { prisma } from "@/lib/prisma";
import { assertMixStartEligible } from "@/lib/mix-start-eligibility";
import { readWorkflowDefinition } from "@/lib/mix-workflow";
import { workflowCalendarStepTime } from "@/lib/workflow-scheduling";
import { DEFAULT_PERSONAL_SCHEDULING } from "@/lib/personal-scheduling";
import { UserFacingError } from "@/lib/user-facing-error";
import type { Channel, Prisma, WorkspaceProfile } from "@/generated/prisma/client";
import { buildJumpReplacementValues, primaryContactEmail, primaryContactPhone, renderJumpSnapshot, type JumpRenderContact, type JumpRenderOwner, type JumpTemplateContent, type JumpRenderedSnapshot } from "@/lib/jump-render";
import { describeStepTiming, describeStepReadiness } from "@/lib/step-timing";

export type BeatWordingPreview = JumpRenderedSnapshot & { recipient: string; warnings: string[] };

/** Uses the same substitutions and fallbacks as a prepared follow-up, without saving one. */
export function previewBeatWording(template: JumpTemplateContent, contact: JumpRenderContact, profile: WorkspaceProfile | null, owner: JumpRenderOwner, channel: Channel): BeatWordingPreview {
  const values = buildJumpReplacementValues(contact, profile, owner, channel);
  const fields = [...new Set([template.subject, template.body, template.script].flatMap(text => text?.match(/{{[^}]+}}/g) ?? []))];
  const warnings = fields.filter(field => !values[field]?.trim()).map(field => `Not filled in: ${field}. Review the wording before sending.`);
  const products = Array.isArray(profile?.products) ? profile.products.flatMap(item => item && typeof item === "object" && !Array.isArray(item) && "value" in item ? [String(item.value)] : []) : [];
  const fallbacks: Array<[boolean, string[]]> = [
    [!contact.firstName, ["{{First Name}}", "{{contact.first_name}}"]],
    [!contact.company?.trim(), ["{{Company}}", "{{contact.company}}"]],
    [!profile?.company?.trim(), ["{{My Company}}", "{{my.company}}"]],
    [!profile?.product1 && !products[0], ["{{My Product 1}}", "{{my.product_1}}"]],
    [!profile?.smsSignature?.trim(), ["{{SMS Signature}}", "{{my.sms_signature}}"]],
    [!profile?.emailSignature?.trim(), ["{{Email Signature}}", "{{my.email_signature}}"]]
  ];
  for (const [missing, aliases] of fallbacks) {
    if (missing) for (const field of fields.filter(field => aliases.includes(field) && values[field]?.trim())) {
      warnings.push(`No saved ${field} detail. This preview uses “${values[field]}”.`);
    }
  }
  const recipient = channel === "EMAIL" ? primaryContactEmail(contact) : primaryContactPhone(contact);
  if (!recipient) warnings.push(channel === "EMAIL" ? "This person has no saved email address." : "This person has no saved phone number.");
  return { ...renderJumpSnapshot(template, contact, profile, owner, channel), recipient, warnings };
}

export async function readBeatPreviewContext(workspaceId: string, contactId: string, db: Prisma.TransactionClient = prisma) {
  const [workspace, contact] = await Promise.all([
    db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, include: { profile: true, owner: { select: { name: true, email: true } } } }),
    db.contact.findFirst({ where: { id: contactId, workspaceId, archivedAt: null }, include: { emails: true, phones: true, addresses: true, customFieldValues: { include: { definition: true } } } })
  ]);
  if (!contact) throw new UserFacingError("Choose a saved person in this account to preview the wording.");
  return { workspace, contact };
}

export type WorkflowStartPreview = { savedInstanceId?: string; revision: number; timezone: string; contactName: string; mixName: string; steps: Array<{ name: string; dueAt: string | null; note: string; wording: BeatWordingPreview }>; automatic: boolean };
export async function previewWorkflowStart(workspaceId: string, contactId: string, mixId: string, now = new Date(), requestId?: string): Promise<WorkflowStartPreview> {
  return prisma.$transaction(async db => {
    if (requestId) {
      const saved = await db.mixWorkflowInstance.findUnique({ where: { workspaceId_admissionKey: { workspaceId, admissionKey: `manual:${contactId}:${mixId}:${requestId}` } }, include: { contact: { select: { displayName: true } } } });
      if (saved) return { savedInstanceId: saved.id, revision: 0, timezone: "UTC", contactName: saved.contact.displayName, mixName: saved.label, steps: [], automatic: false };
    }
    await assertMixStartEligible(db, workspaceId, contactId, mixId);
    const definition = await readWorkflowDefinition(db, workspaceId), mix = definition.mixes.find(item => item.id === mixId)!;
    const [{ workspace, contact }, preference, automation, busy] = await Promise.all([
      readBeatPreviewContext(workspaceId, contactId, db),
      db.workspacePreference.findUnique({ where: { workspaceId } }),
      db.automationPreference.findUnique({ where: { workspaceId } }),
      db.calendarEntry.findMany({ where: { workspaceId, canceledAt: null, endsAt: { gte: new Date(now.getTime() - 2 * 86400000) }, startsAt: { lte: new Date(now.getTime() + 800 * 86400000) } }, select: { startsAt: true, endsAt: true, kind: true } })
    ]);
    const timezone = (await db.userPreference.findUnique({ where: { userId: workspace.ownerId }, select: { timezone: true } }))?.timezone ?? "UTC";
    const steps = mix.steps.filter(step => !definition.gatedStepIds.includes(step.id));
    if (!steps.length) throw new UserFacingError("This Mix has no starting Beats. Review its connections before starting it.");
    return { revision: definition.revision, timezone, contactName: contact.displayName, mixName: mix.name, automatic: Boolean(automation?.enabled), steps: steps.map(step => ({ name: step.name, dueAt: step.anchor === "CALENDAR_DAY" ? workflowCalendarStepTime(step, now, timezone, preference ?? DEFAULT_PERSONAL_SCHEDULING, busy).toISOString() : null, note: step.anchor === "CALENDAR_DAY" ? "Due for review; sending settings and contact eligibility still apply." : `Due ${describeStepTiming(step)}. ${describeStepReadiness(step)} Link an appointment after starting.`, wording: previewBeatWording(step, contact, workspace.profile, workspace.owner, step.channel) })) };
  });
}
