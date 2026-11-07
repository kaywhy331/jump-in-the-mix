import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { readWorkflowDefinition, workflowJson } from "../../src/lib/mix-workflow";
import { emptyWorkflow, emptyWorkflowState, type WorkflowRule } from "../../src/lib/mix-workflow-types";

export const focusAt = new Date("2026-11-01T09:30:00Z");
export async function journeyPersonFocusFixture() {
  const user = await prisma.user.create({ data: { email: `focus-${randomUUID()}@example.test`, name: "Focus owner", emailVerifiedAt: focusAt } });
  const workspace = await prisma.workspace.create({ data: { ownerId: user.id, name: "Focus fixture", slug: randomUUID(), members: { create: { userId: user.id, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } });
  const workspaceId = workspace.id;
  const foreign = await prisma.workspace.create({ data: { ownerId: user.id, name: "Foreign fixture", slug: randomUUID() } });
  const contact = await prisma.contact.create({ data: { workspaceId, displayName: "Pia Fixture" } });
  const outsider = await prisma.contact.create({ data: { workspaceId: foreign.id, displayName: "Foreign person" } });
  const names = ["Earlier unrelated", "Follow-up only", "Inactive start", "Foreign start", "Past work", "Current work", "Personal start", "Other work", "Retargeted work"] as const;
  const mixes: Record<string, string> = {};
  for (const [index, name] of names.entries()) {
    const mix = await prisma.mix.create({ data: { workspaceId, name, status: "ACTIVE", triggerMode: "MANUAL_START", createdAt: new Date(focusAt.getTime() + index * 60000) } });
    mixes[name] = mix.id;
  }
  for (const [name, isActive, owner] of [["Personal start", true, workspaceId], ["Inactive start", false, workspaceId], ["Foreign start", true, foreign.id]] as const) {
    await prisma.mixAssignment.create({ data: { workspaceId: owner, contactId: contact.id, mixId: mixes[name], isActive, assignmentKey: randomUUID() } });
  }
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Follow-up Beat", channel: "PHONE_CALL", versions: { create: { version: 1, script: "Synthetic fixture" } } }, include: { versions: true } });
  const step = await prisma.mixStep.create({ data: { mixId: mixes["Follow-up only"], stepVersionId: template.versions[0].id, dayOffset: 0, sortOrder: 0 } });
  await prisma.jump.create({ data: { workspaceId, contactId: contact.id, mixId: mixes["Follow-up only"], mixStepId: step.id, stepVersionId: template.versions[0].id, uniquenessKey: randomUUID(), scheduledAt: focusAt, reason: "Fixture", templateSnapshot: {}, renderedSnapshot: {} } });
  const rule = (id: string, from: string, to: string): WorkflowRule => ({ id, name: `${from} to ${to}`, source: { mixId: mixes[from], stepId: null }, mode: "PARALLEL", enabled: true, join: null, routes: [{ id: `${id}-route`, label: "After completion", when: "FINISHED", outcome: "", delayMinutes: 0, target: { mixId: mixes[to], stepId: null }, maxVisits: null, replace: false }] });
  const rules = [rule("taken", "Past work", "Current work"), rule("membership-only", "Personal start", "Current work"), rule("unrelated", "Earlier unrelated", "Follow-up only")];
  await prisma.mixWorkflow.create({ data: { workspaceId, configuration: workflowJson({ ...emptyWorkflow(), rules }) } });
  const saved = await readWorkflowDefinition(prisma, workspaceId);
  const state = emptyWorkflowState();
  state.runs = ["Past work", "Current work"].map((name, index) => ({ id: name, mixId: mixes[name], status: index ? "ACTIVE" : "FINISHED", startedAt: focusAt.toISOString(), completedAt: index ? null : focusAt.toISOString(), parentTransitionId: index ? "taken-path" : null, legacy: false }));
  state.evaluations = [{ id: "evaluation", ruleId: "taken", runId: "Past work", visitId: null, occurredAt: focusAt.toISOString(), outcome: null, decidedAt: null, generation: 0, status: "ROUTED", joined: false }];
  state.transitions = [{ id: "taken-path", evaluationId: "evaluation", routeId: "taken-route", generation: 0, dueAt: focusAt.toISOString(), startedAt: focusAt.toISOString(), status: "STARTED", reason: null, target: rules[0].routes[0].target, targetRunId: "Current work", targetVisitId: null }];
  const work = await prisma.mixWorkflowInstance.create({ data: { workspaceId, contactId: contact.id, admissionKey: randomUUID(), label: "First piece", definition: workflowJson(saved), state: workflowJson(state), createdAt: focusAt } });
  const second = emptyWorkflowState();
  second.runs = [{ ...state.runs[1], id: "second", mixId: mixes["Other work"], parentTransitionId: null }];
  await prisma.mixWorkflowInstance.create({ data: { workspaceId, contactId: contact.id, admissionKey: randomUUID(), label: "Second piece", definition: workflowJson(saved), state: workflowJson(second), createdAt: focusAt } });
  const cleanup = async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, foreign.id] } } });
    await prisma.user.delete({ where: { id: user.id } });
  };
  return { workspaceId, foreignId: foreign.id, userId: user.id, contactId: contact.id, foreignContactId: outsider.id, mixes, rules, work, saved, state, cleanup };
}
