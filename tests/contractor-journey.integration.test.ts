import { previewWorkflowStart } from "@/lib/workflow-start-preview";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { readWorkflowAttention } from "@/lib/workflow-attention";
import { processWorkflowInstance, startWorkflowInstance, workflowState } from "@/lib/mix-workflow";
import { assertMixStartEligible } from "@/lib/mix-start-eligibility";
import { emptyWorkflow, type WorkflowRule } from "@/lib/mix-workflow-types";

const auth = vi.hoisted(() => ({ context: {} as Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => auth.context }));
import { GET as exportAccount } from "@/app/api/account/export/route";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("contractor journey continuity and truthful state", () => {
  let workspaceId: string, userId: string, contactId: string, mixId: string, ruleId: string;
  beforeEach(async () => {
    const user = await prisma.user.create({ data: { email: `contractor-${randomUUID()}@example.com`, name: "Owner" } }); userId = user.id;
    const workspace = await prisma.workspace.create({ data: { name: "Contractor test", slug: randomUUID(), ownerId: userId } }); workspaceId = workspace.id;
    const contact = await prisma.contact.create({ data: { workspaceId, displayName: "Jordan Test" } }); contactId = contact.id;
    const mix = await prisma.mix.create({ data: { workspaceId, name: "Estimate follow-up", triggerMode: "MANUAL_START", status: "ACTIVE" } }); mixId = mix.id;
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Check the estimate", channel: "SMS", versions: { create: { version: 1, body: "Any questions?" } } }, include: { versions: true } });
    await prisma.mixStep.create({ data: { mixId, stepVersionId: template.versions[0].id, dayOffset: 0, sortOrder: 0 } });
    ruleId = randomUUID();
    const rule: WorkflowRule = { id: ruleId, name: "What happened with the estimate?", source: { mixId, stepId: null }, enabled: true, mode: "CHOICE", join: null,
      routes: [{ id: randomUUID(), label: "Estimate accepted", when: "OUTCOME", outcome: "Estimate accepted", delayMinutes: 0, target: null, maxVisits: null, replace: false }] };
    await prisma.mixWorkflow.create({ data: { workspaceId, configuration: JSON.parse(JSON.stringify({ ...emptyWorkflow(), rules: [rule] })) } });
    auth.context = { user, workspace, impersonation: null };
  });
  afterEach(async () => { await prisma.workspace.delete({ where: { id: workspaceId } }); await prisma.user.delete({ where: { id: userId } }); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("refuses a stopped admission without creating a run or clearing the stop", async () => {
    await prisma.mixStop.create({ data: { workspaceId, contactId, mixId, reason: "Owner stopped this" } });
    await expect(startWorkflowInstance({ workspaceId, contactId, mixId, requestId: randomUUID() })).rejects.toThrow("stopped for this person");
    expect(await prisma.mixWorkflowInstance.count({ where: { workspaceId } })).toBe(0);
    expect(await prisma.mixStop.count({ where: { workspaceId } })).toBe(1);
    await expect(prisma.$transaction(db => assertMixStartEligible(db, workspaceId, contactId, mixId))).rejects.toThrow("stopped for this person");
  });
  it("refuses DNC and foreign-person admissions", async () => {
    await prisma.contactRelationshipState.create({ data: { workspaceId, contactId, doNotContact: true } });
    await expect(startWorkflowInstance({ workspaceId, contactId, mixId, requestId: randomUUID() })).rejects.toThrow("Do not contact");
    await expect(startWorkflowInstance({ workspaceId, contactId: randomUUID(), mixId, requestId: randomUUID() })).rejects.toThrow("person");
    expect(await prisma.mixWorkflowInstance.count({ where: { workspaceId } })).toBe(0);
  });
  it("shows a decision-only account in Today and the digest source, retaining exact work context", async () => {
    const start = new Date(Date.now() - 3 * 86400000);
    const instanceId = await startWorkflowInstance({ workspaceId, contactId, mixId, requestId: randomUUID(), now: start });
    await processWorkflowInstance(workspaceId, instanceId, start);
    await prisma.jump.updateMany({ where: { workflowInstanceId: instanceId }, data: { status: "DONE", completedAt: new Date(start.getTime() + 1000) } });
    await processWorkflowInstance(workspaceId, instanceId, new Date());
    const attention = await readWorkflowAttention(workspaceId);
    expect(attention.total).toBe(1);
    expect(attention.items[0]).toMatchObject({ contactId, contactName: "Jordan Test", action: "Record update" });
    expect(new URL(attention.items[0].href, "https://local.invalid").searchParams.get("work")).toBe(instanceId);
    expect(await prisma.jump.count({ where: { workspaceId, status: "PENDING" } })).toBe(0);
    const instance = await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id: instanceId } });
    await processWorkflowInstance(workspaceId, instanceId, new Date(), { requestId: randomUUID(), expectedRevision: instance.revision, evaluationId: workflowState(instance.state).evaluations[0].id, outcome: "Estimate accepted" });
    expect((await readWorkflowAttention(workspaceId)).total).toBe(0);
  });
  it("keeps a deliberate pause out of the owner-input queue", async () => {
    const instanceId = await startWorkflowInstance({ workspaceId, contactId, mixId, requestId: randomUUID() });
    await processWorkflowInstance(workspaceId, instanceId, new Date(), { requestId: randomUUID(), status: "PAUSED" });
    expect((await readWorkflowAttention(workspaceId)).total).toBe(0);
  });
  it("exports relationship preferences and explicit stops as owner data", async () => {
    await prisma.contactRelationshipState.create({ data: { workspaceId, contactId, doNotContact: true, preferredChannel: "EMAIL", priority: "HIGH", relationshipStatus: "Agreed callback", nextCommitmentAt: new Date("2026-10-06T16:00:00Z") } });
    const stop = await prisma.mixStop.create({ data: { workspaceId, contactId, mixId, reason: "Await requested date" } });
    const response = await exportAccount(new Request("https://local.invalid/api/account/export"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.contacts[0].relationshipState).toMatchObject({ doNotContact: true, preferredChannel: "EMAIL", priority: "HIGH", relationshipStatus: "Agreed callback", nextCommitmentAt: "2026-10-06T16:00:00.000Z" });
    expect(data.mixStops).toEqual([expect.objectContaining({ id: stop.id, contactId, mixId, reason: "Await requested date" })]);
    expect(data.excludedSecurityMaterial).toContain("session tokens");
  });
  it("saves a dated callback once, ends its pending reminder, and brings back one due action", async () => {
    const now = new Date(), due = new Date(now.getTime() + 86400000);
    const instanceId = await startWorkflowInstance({ workspaceId, contactId, mixId, requestId: randomUUID() });
    const otherId = await startWorkflowInstance({ workspaceId, contactId, mixId, requestId: randomUUID(), label: "Separate estimate" });
    await processWorkflowInstance(workspaceId, instanceId, now); await processWorkflowInstance(workspaceId, otherId, now);
    const before = await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id: instanceId } });
    const command = { requestId: randomUUID(), expectedRevision: before.revision, businessUpdate: { kind: "WAIT" as const, runId: workflowState(before.state).runs[0].id, scope: "SOURCE_MIX_REMAINDER" as const, source: "CUSTOMER" as const, timezone: "America/Los_Angeles", dueAt: due.toISOString() } };
    await processWorkflowInstance(workspaceId, instanceId, now, command);
    await processWorkflowInstance(workspaceId, instanceId, now, command);
    expect(await prisma.jump.count({ where: { workflowInstanceId: instanceId, status: "PENDING" } })).toBe(0);
    expect(await prisma.jump.count({ where: { workflowInstanceId: otherId, status: "PENDING" } })).toBe(1);
    const state = workflowState((await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id: instanceId } })).state);
    expect(state.updates).toHaveLength(1); expect(state.commitments).toHaveLength(1);
    expect((await readWorkflowAttention(workspaceId, 30, 0, now)).total).toBe(0);
    expect((await readWorkflowAttention(workspaceId, 30, 0, now)).futureTotal).toBe(1);
    expect((await readWorkflowAttention(workspaceId, 30, 0, due)).total).toBe(1);
    await processWorkflowInstance(workspaceId, instanceId, due);
    expect((await readWorkflowAttention(workspaceId, 30, 0, due)).total).toBe(1);
  });
  it("saves a business fact while a message is processing, then applies it without changing the delivery record", async () => {
    const now = new Date(), instanceId = await startWorkflowInstance({ workspaceId, contactId, mixId, requestId: randomUUID() });
    await processWorkflowInstance(workspaceId, instanceId, now);
    const jump = await prisma.jump.findFirstOrThrow({ where: { workflowInstanceId: instanceId } });
    const before = await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id: instanceId } });
    const delivery = await prisma.automatedDelivery.create({ data: { workspaceId, jumpId: jump.id, channel: "SMS", reviewEligibleAt: now, status: "PROCESSING" } });
    const command = { requestId: randomUUID(), expectedRevision: before.revision, businessUpdate: { kind: "OUTCOME" as const, runId: workflowState(before.state).runs[0].id, scope: "SOURCE_MIX_REMAINDER" as const, ruleId, outcome: "Estimate accepted" } };
    await processWorkflowInstance(workspaceId, instanceId, now, command);
    expect(workflowState((await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id: instanceId } })).state).pendingBusinessUpdate?.requestId).toBe(command.requestId);
    await prisma.automatedDelivery.update({ where: { id: delivery.id }, data: { status: "DELIVERED", providerId: "recorded-provider-id" } });
    await prisma.jump.update({ where: { id: jump.id }, data: { status: "DONE", completedAt: now, completionMethod: "automatic:sms" } });
    await processWorkflowInstance(workspaceId, instanceId, new Date(now.getTime() + 20000));
    const state = workflowState((await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id: instanceId } })).state);
    expect(state.pendingBusinessUpdate).toBeUndefined(); expect(state.updates).toHaveLength(1);
    expect(state.visits[0].status).toBe("DONE");
    expect((await prisma.automatedDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).providerId).toBe("recorded-provider-id");
    await expect(processWorkflowInstance(workspaceId, instanceId, new Date(), { requestId: randomUUID(), undoUpdateId: command.requestId })).rejects.toThrow("message");
  });
  it("can undo a callback before subsequent work and retains the canceled commitment", async () => {
    const now = new Date(), instanceId = await startWorkflowInstance({ workspaceId, contactId, mixId, requestId: randomUUID() });
    await processWorkflowInstance(workspaceId, instanceId, now);
    const before = await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id: instanceId } });
    const requestId = randomUUID();
    await processWorkflowInstance(workspaceId, instanceId, now, { requestId, businessUpdate: { kind: "WAIT", runId: workflowState(before.state).runs[0].id, scope: "SOURCE_MIX_REMAINDER", source: "OWNER", dueAt: new Date(now.getTime() + 86400000).toISOString(), timezone: "UTC" } });
    await processWorkflowInstance(workspaceId, instanceId, now, { requestId: randomUUID(), undoUpdateId: requestId });
    expect(await prisma.jump.count({ where: { workflowInstanceId: instanceId, status: "PENDING" } })).toBe(1);
    const state = workflowState((await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id: instanceId } })).state);
    expect(state.commitments?.[0].status).toBe("CANCELED"); expect(state.updates?.[0].reversedAt).toBeTruthy();
  });
  it("returns a saved start receipt on retry even if the owner subsequently stops that Mix", async () => {
    const requestId = randomUUID(), instanceId = await startWorkflowInstance({ workspaceId, contactId, mixId, requestId });
    await prisma.mixStop.create({ data: { workspaceId, contactId, mixId, reason: "Stopped after start" } });
    expect(await startWorkflowInstance({ workspaceId, contactId, mixId, requestId })).toBe(instanceId);
    expect(await prisma.mixWorkflowInstance.count({ where: { workspaceId } })).toBe(1);
  });

  it("previews the same actual start time that the workflow materializes", async () => {
    const now = new Date("2026-10-06T16:15:00.000Z");
    const preview = await previewWorkflowStart(workspaceId, contactId, mixId, now);
    const id = await startWorkflowInstance({ workspaceId, contactId, mixId, now, requestId: randomUUID(), expectedDefinitionRevision: preview.revision });
    await processWorkflowInstance(workspaceId, id, now);
    const jump = await prisma.jump.findFirstOrThrow({ where: { workflowInstanceId: id } });
    expect(jump.scheduledAt.toISOString()).toBe(preview.steps[0].dueAt);
    expect(preview.contactName).toBe("Jordan Test");
    await expect(startWorkflowInstance({ workspaceId, contactId, mixId, requestId: randomUUID(), expectedDefinitionRevision: preview.revision + 1 })).rejects.toThrow("changed");
  });
  it("keeps failed preparation visible until an actual successful retry", async () => {
    const id = await startWorkflowInstance({ workspaceId, contactId, mixId, requestId: randomUUID() });
    await processWorkflowInstance(workspaceId, id);
    await prisma.mixWorkflowInstance.update({ where: { id }, data: { updatedAt: new Date(Date.now() - 60000) } });
    await prisma.job.create({ data: { workspaceId, task: "mix-workflow", payload: { instanceId: id }, failedAt: new Date(), lastError: "Synthetic preparation failure" } });
    expect((await readWorkflowAttention(workspaceId)).items.some(item => item.reason.includes("another try"))).toBe(true);
    await processWorkflowInstance(workspaceId, id, new Date(), { requestId: randomUUID(), retry: true });
    expect((await readWorkflowAttention(workspaceId)).items.some(item => item.reason.includes("another try"))).toBe(false);
  });

});
