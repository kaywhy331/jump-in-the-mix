import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { readWorkflowDefinition, workflowJson } from "../../src/lib/mix-workflow";
import { emptyWorkflowState } from "../../src/lib/mix-workflow-types";

export const archivedAt = new Date("2026-11-01T09:30:00Z");
export async function journeyArchivedWorkFixture() {
  const user = await prisma.user.create({ data: { email: `archived-${randomUUID()}@example.test`, name: "Archive owner", emailVerifiedAt: archivedAt } });
  const workspace = await prisma.workspace.create({ data: { ownerId: user.id, name: "Archived fixture", slug: randomUUID(), members: { create: { userId: user.id, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } });
  const foreign = await prisma.workspace.create({ data: { ownerId: user.id, name: "Foreign fixture", slug: randomUUID() } });
  const contact = await prisma.contact.create({ data: { workspaceId: workspace.id, displayName: "Alex Fixture" } });
  const second = await prisma.contact.create({ data: { workspaceId: workspace.id, displayName: "Blair Fixture" } });
  const outsider = await prisma.contact.create({ data: { workspaceId: foreign.id, displayName: "Foreign person" } });
  const makeMix = async (workspaceId: string, name: string, status: "ACTIVE" | "ARCHIVED") => {
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Call about the estimate", channel: "PHONE_CALL", versions: { create: { version: 1, script: "Ask about the estimate." } } }, include: { versions: true } });
    return prisma.mix.create({ data: { workspaceId, name, status, triggerMode: "MANUAL_START", steps: { create: { stepVersionId: template.versions[0].id, dayOffset: 0, sortOrder: 0 } } }, include: { steps: true } });
  };
  const pending = await makeMix(workspace.id, "Archived estimates", "ARCHIVED");
  const empty = await makeMix(workspace.id, "Archived without pending follow-ups", "ARCHIVED");
  const active = await makeMix(workspace.id, "Current estimates", "ACTIVE");
  const foreignMix = await makeMix(foreign.id, "Foreign archived estimates", "ARCHIVED");
  const addJump = (mix: typeof pending, contactId: string, status: "PENDING" | "DONE" | "SKIPPED" | "CANCELED") => prisma.jump.create({ data: {
    workspaceId: mix.workspaceId, contactId, mixId: mix.id, mixStepId: mix.steps[0].id, stepVersionId: mix.steps[0].stepVersionId,
    uniquenessKey: randomUUID(), status, scheduledAt: archivedAt, reason: "Synthetic fixture", templateSnapshot: {}, renderedSnapshot: {}
  } });
  for (const status of ["PENDING", "PENDING", "DONE", "SKIPPED", "CANCELED"] as const) await addJump(pending, contact.id, status);
  await addJump(pending, second.id, "PENDING");
  await addJump(active, second.id, "PENDING");
  for (let i = 0; i < 5; i++) await addJump(foreignMix, outsider.id, "PENDING");
  // Ongoing work without a prepared follow-up still keeps an archived Mix visible.
  const state = emptyWorkflowState();
  state.runs = [{ id: "waiting-run", mixId: empty.id, status: "ACTIVE", startedAt: archivedAt.toISOString(), completedAt: null, parentTransitionId: null, legacy: false }];
  await prisma.mixWorkflowInstance.create({ data: { workspaceId: workspace.id, contactId: contact.id, admissionKey: randomUUID(), label: "Awaiting estimate outcome", definition: workflowJson(await readWorkflowDefinition(prisma, workspace.id)), state: workflowJson(state) } });
  return { workspaceId: workspace.id, foreignId: foreign.id, userId: user.id, contactId: contact.id, secondId: second.id, pending, empty, active, foreignMix,
    cleanup: async () => { await prisma.workspace.deleteMany({ where: { id: { in: [workspace.id, foreign.id] } } }); await prisma.user.delete({ where: { id: user.id } }); }
  };
}
