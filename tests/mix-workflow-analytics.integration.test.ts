import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { readWorkflowAnalytics } from "@/lib/mix-workflow-analytics";
import { readWorkflowGraph } from "@/lib/mix-workflow-view";
import { readWorkflowDefinition, workflowJson } from "@/lib/mix-workflow";
import { emptyWorkflowState } from "@/lib/mix-workflow-types";
const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("Journey analytics database scope", () => {
  let workspaceId: string, otherId: string, userId: string, mixId: string, stepId: string, versionId: string, selectedId: string;
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { name: "Analytics fixture", email: `${randomUUID()}@example.invalid` } })).id;
    workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Analytics fixture", slug: randomUUID() } })).id;
    otherId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Other fixture", slug: randomUUID() } })).id;
    mixId = (await prisma.mix.create({ data: { workspaceId, name: "A real configured Mix", status: "ACTIVE", triggerMode: "MANUAL_START" } })).id;
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "A real Beat", channel: "PHONE_CALL", versions: { create: { version: 1, script: "Fixture" } } }, include: { versions: true } }); versionId = template.versions[0].id;
    stepId = (await prisma.mixStep.create({ data: { mixId, stepVersionId: versionId, dayOffset: 0, sortOrder: 0 } })).id;
    const stage = await prisma.journeyStage.create({ data: { workspaceId, name: "Custom account stage", position: 0 } });
    await prisma.contact.createMany({ data: Array.from({ length: 260 }, (_, n) => ({ id: `analytics-${workspaceId}-${n}`, workspaceId, displayName: `Person ${String(n).padStart(3, "0")}` })) });
    selectedId = `analytics-${workspaceId}-259`;
    await prisma.contactJourney.create({ data: { workspaceId, contactId: selectedId, stageId: stage.id } });
    await prisma.contact.createMany({ data: [{ workspaceId, displayName: "Archived", archivedAt: new Date() }, { workspaceId: otherId, displayName: "Private other account" }] });
    await prisma.jump.create({ data: { workspaceId, contactId: selectedId, mixId, mixStepId: stepId, stepVersionId: versionId, uniquenessKey: randomUUID(), reason: "Fixture", scheduledAt: new Date(Date.now() - 10000), templateSnapshot: {}, renderedSnapshot: {} } });
  });
  afterAll(async () => { await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, otherId] } } }); await prisma.user.delete({ where: { id: userId } }); await prisma.$disconnect(); });
  it("counts beyond both roster pages and scan batches without including archived or other-account contacts", async () => {
    const data = await readWorkflowAnalytics(workspaceId, {});
    expect(data.summary).toMatchObject({ total: 260, active: 1, not_started: 259 });
    expect(data.roster).toHaveLength(10); expect(data.nodes[`beat:${stepId}`].current).toBe(1);
    const selected = await readWorkflowAnalytics(workspaceId, { query: "259", node: `mix:${mixId}`, status: "active" });
    expect(selected.roster.map(person => person.id)).toEqual([selectedId]);
    expect(selected.roster[0].stageName).toBe("Custom account stage");
    expect((await readWorkflowAnalytics(workspaceId, { contactId: selectedId })).summary.total).toBe(1);
    expect((await readWorkflowAnalytics(otherId, { contactId: selectedId })).summary.total).toBe(0);
  });
  it("counts adopted follow-ups once and keeps waits visible after a source Beat is completed", async () => {
    const state = emptyWorkflowState(), at = new Date().toISOString();
    state.runs.push({ id: "run", mixId, startedAt: at, completedAt: at, status: "FINISHED", parentTransitionId: null, legacy: true });
    state.visits.push({ id: "visit", runId: "run", stepId, readyAt: at, completedAt: at, status: "DONE", outcome: null, reason: null, parentTransitionId: null });
    state.evaluations.push({ id: "evaluation", ruleId: "rule", runId: "run", visitId: "visit", occurredAt: at, outcome: null, decidedAt: null, generation: 1, status: "WAITING", joined: false });
    const instance = await prisma.mixWorkflowInstance.create({ data: { workspaceId, contactId: selectedId, admissionKey: randomUUID(), label: "Waiting for a choice", definition: workflowJson(await readWorkflowDefinition(prisma, workspaceId)), state: workflowJson(state) } });
    await prisma.jump.updateMany({ where: { workspaceId, contactId: selectedId }, data: { workflowInstanceId: instance.id, workflowVisitId: "visit", status: "DONE" } });
    const data = await readWorkflowAnalytics(workspaceId, { node: `beat:${stepId}` });
    expect(data.summary).toMatchObject({ total: 260, waiting: 1, active: 0, completed: 0 });
    expect(data.roster[0].positions).toHaveLength(1); expect(data.roster[0].positions[0].reason).toBe("Awaiting an outcome");
  });
  it("keeps the directory account-wide while selected work stays scoped to its person and workspace", async () => {
    const selected = await readWorkflowGraph(workspaceId, { contactId: selectedId, canEdit: true });
    expect(selected.analytics.summary.total).toBe(260);
    expect(selected.analytics.roster).toHaveLength(10);
    expect(selected.instances).toHaveLength(1);
    expect(selected.instances.every(instance => instance.contactId === selectedId)).toBe(true);
    const other = await readWorkflowGraph(otherId, { contactId: selectedId, canEdit: false });
    expect(other.analytics.summary.total).toBe(1);
    expect(other.instances).toEqual([]);
    expect(other.people.some(person => person.id === selectedId)).toBe(false);
  });
});
