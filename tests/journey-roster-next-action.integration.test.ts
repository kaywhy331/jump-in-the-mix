import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { workflowJson } from "@/lib/mix-workflow";
import { emptyWorkflowState, type WorkflowDefinition } from "@/lib/mix-workflow-types";
import { readWorkflowAnalytics } from "@/lib/mix-workflow-analytics";
import { readNextActions } from "@/lib/next-action-reader";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const now = new Date("2026-11-01T09:30:00Z"), options = { now, timeZone: "America/Los_Angeles" };
describe.skipIf(!local)("Journey roster shared next actions", () => {
  let userId: string, workspaceId: string, foreignId: string, contactId: string, mixId: string;
  beforeEach(async () => {
    userId = (await prisma.user.create({ data: { email: `roster-${randomUUID()}@example.test`, name: "Fixture owner" } })).id;
    workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Roster fixture", slug: randomUUID() } })).id;
    foreignId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Foreign fixture", slug: randomUUID() } })).id;
    contactId = (await prisma.contact.create({ data: { workspaceId, displayName: "A person" } })).id;
    mixId = (await prisma.mix.create({ data: { workspaceId, name: "Fixture Mix", triggerMode: "MANUAL_START" } })).id;
  });
  afterEach(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, foreignId] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });
  afterAll(async () => { await prisma.$disconnect(); });
  async function outcome(label: string, person = contactId, workspace = workspaceId) {
    const state = emptyWorkflowState();
    state.runs = [{ id: "run", mixId, status: "ACTIVE", startedAt: now.toISOString(), completedAt: null, parentTransitionId: null, legacy: false }];
    state.evaluations = [{ id: "answer", ruleId: "decision", runId: "run", visitId: null, occurredAt: now.toISOString(), outcome: null, decidedAt: null, generation: 0, status: "WAITING", joined: false }];
    const definition: WorkflowDefinition = { revision: 1, mixes: [], gatedStepIds: [], intentionalEnds: [], rules: [{ id: "decision", name: "Estimate reply", source: { mixId, stepId: null }, enabled: true, mode: "CHOICE", join: null, routes: [{ id: "yes", label: "Yes", when: "OUTCOME", outcome: "yes", target: null, delayMinutes: 0, maxVisits: null, replace: false }] }] };
    return prisma.mixWorkflowInstance.create({ data: { workspaceId: workspace, contactId: person, admissionKey: randomUUID(), label, definition: workflowJson(definition), state: workflowJson(state), updatedAt: now } });
  }
  it("keeps both instances' obligations and chooses the same primary action as the person's projection", async () => {
    await outcome("First estimate"); await outcome("Second estimate");
    const data = await readWorkflowAnalytics(workspaceId, options), person = data.roster[0];
    const projection = await readNextActions(workspaceId, { ...options, contactId });
    expect(person.nextActions).toEqual(projection.items);
    expect(person.nextActions).toHaveLength(2);
    expect(person.next).toEqual(projection.items[0]);
    expect(person.nextActions.every(item => item.detail && item.action === "Record outcome")).toBe(true);
    expect(data.nextProjection).toMatchObject({ observedAt: now.toISOString(), timeZone: options.timeZone, state: "ready" });
  });
  it("shows an outcome-only person's next action and no action for Do not contact", async () => {
    await outcome("Outcome only");
    expect(await prisma.jump.count({ where: { workspaceId } })).toBe(0);
    expect((await readWorkflowAnalytics(workspaceId, options)).roster[0].next?.action).toBe("Record outcome");
    await prisma.contactRelationshipState.create({ data: { workspaceId, contactId, doNotContact: true } });
    const person = (await readWorkflowAnalytics(workspaceId, options)).roster[0];
    expect(person.next).toBeNull(); expect(person.nextActions).toEqual([]);
  });
  it("never reads a foreign contact, its malformed work, preparation or intake through a batch", async () => {
    await outcome("Own outcome");
    const foreign = await prisma.contact.create({ data: { workspaceId: foreignId, displayName: "Foreign person" } });
    const work = await outcome("Foreign outcome", foreign.id, foreignId);
    await prisma.mixWorkflowInstance.update({ where: { id: work.id }, data: { definition: {} } });
    await prisma.job.createMany({ data: ["generate-jumps", "mix-workflow"].map(task => ({ workspaceId: foreignId, task, payload: { contactId: foreign.id } })) });
    const own = await readNextActions(workspaceId, { ...options, contactId });
    expect(await readNextActions(workspaceId, { ...options, contactIds: [contactId, foreign.id] })).toEqual(own);
    expect(await readNextActions(workspaceId, { ...options, contactIds: [foreign.id] })).toMatchObject({ items: [], state: "ready" });
    expect((await readWorkflowAnalytics(workspaceId, { ...options, contactId: foreign.id })).roster).toEqual([]);
    expect((await readNextActions(workspaceId, { ...options, contactIds: [] })).items).toEqual([]);
    expect((await readNextActions(workspaceId, { ...options, contactId, contactIds: [foreign.id] })).items).toEqual([]);
  });
  it("scopes preparation to the roster page, retaining preparing, failed and unreadable states", async () => {
    const work = await outcome("Outcome");
    const other = await prisma.contact.create({ data: { workspaceId, displayName: "Z person" } });
    const job = await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: { contactIds: [other.id] }, createdAt: now } });
    const read = () => readWorkflowAnalytics(workspaceId, { ...options, query: "A person" });
    expect((await read()).nextProjection?.state).toBe("ready");
    await prisma.job.update({ where: { id: job.id }, data: { payload: { contactIds: [contactId, other.id] } } });
    expect((await read()).nextProjection?.state).toBe("preparing");
    await prisma.job.update({ where: { id: job.id }, data: { failedAt: now } });
    expect((await read()).nextProjection?.state).toBe("failed");
    await prisma.mixWorkflowInstance.update({ where: { id: work.id }, data: { definition: {} } });
    expect((await read()).nextProjection?.state).toBe("unavailable");
  });
  it("keeps jobs scoped by workspace and instance, and excludes off-page next actions", async () => {
    const work = await outcome("Outcome");
    const other = await prisma.contact.create({ data: { workspaceId, displayName: "Z person" } });
    await outcome("Other outcome", other.id);
    await prisma.job.create({ data: { workspaceId: foreignId, task: "mix-workflow", payload: { instanceId: work.id }, failedAt: new Date(now.getTime() + 1000) } });
    let projection = await readNextActions(workspaceId, { ...options, contactIds: [contactId] });
    expect(projection.items).toHaveLength(1); expect(projection.state).toBe("ready");
    await prisma.job.create({ data: { workspaceId, task: "mix-workflow", payload: { instanceId: work.id } } });
    projection = await readNextActions(workspaceId, { ...options, contactIds: [contactId] });
    expect(projection.state).toBe("preparing"); expect(projection.items.every(item => item.contactId === contactId)).toBe(true);
  });
  it("reads only the roster page's obligations after pagination", async () => {
    await outcome("First person's outcome");
    const { pageSize } = await readWorkflowAnalytics(workspaceId, options);
    await prisma.contact.createMany({ data: Array.from({ length: pageSize }, (_, n) => ({ workspaceId, displayName: `B person ${n}` })) });
    const last = await prisma.contact.create({ data: { workspaceId, displayName: "Z person" } });
    const work = await outcome("Off-page unreadable work", last.id);
    await prisma.mixWorkflowInstance.update({ where: { id: work.id }, data: { definition: {} } });
    const first = await readWorkflowAnalytics(workspaceId, options);
    expect(first.roster).toHaveLength(pageSize); expect(first.nextProjection?.state).toBe("ready");
    expect((await readWorkflowAnalytics(workspaceId, { ...options, offset: pageSize })).nextProjection?.state).toBe("unavailable");
  });
});
