import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { emptyWorkflowState, type WorkflowDefinition } from "@/lib/mix-workflow-types";
import { nextActionAttention, readNextActions, readNextActionSnapshot } from "@/lib/next-action-reader";
import { nextActionsInView } from "@/lib/next-action";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const now = new Date("2026-11-01T09:30:00.000Z"), options = { now, timeZone: "America/Los_Angeles" };
const definition: WorkflowDefinition = { revision: 1, mixes: [], gatedStepIds: [], intentionalEnds: [], rules: [{
  id: "decision", name: "Estimate reply", source: { mixId: "fixture", stepId: null }, enabled: true, mode: "CHOICE", join: null,
  routes: [{ id: "yes", label: "Yes", when: "OUTCOME", outcome: "yes", target: null, delayMinutes: 0, maxVisits: null, replace: false }]
}] };

describe.skipIf(!local)("shared next-action snapshot", () => {
  let userId: string, workspaceId: string, foreignId: string;
  let fixture: { contactId: string; mixId: string; mixStepId: string; stepVersionId: string };
  beforeEach(async () => {
    const suffix = randomUUID();
    userId = (await prisma.user.create({ data: { email: `next-action-${suffix}@example.com`, name: "Fixture owner" } })).id;
    workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Next fixture", slug: suffix } })).id;
    foreignId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Other fixture", slug: `other-${suffix}` } })).id;
    const contact = await prisma.contact.create({ data: { workspaceId, displayName: "Fixture person" } });
    const version = await prisma.stepVersion.create({ data: { stepTemplate: { create: { workspaceId, name: "Fixture text", channel: "SMS" } }, version: 1, body: "Unsent fixture" } });
    const mix = await prisma.mix.create({ data: { workspaceId, name: "One-time fixture", source: "ONE_TIME", triggerMode: "MANUAL_START", steps: { create: { stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } } }, include: { steps: true } });
    fixture = { contactId: contact.id, mixId: mix.id, mixStepId: mix.steps[0].id, stepVersionId: version.id };
  });
  afterEach(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: [workspaceId, foreignId].filter(Boolean) } } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  });
  afterAll(async () => { await prisma.$disconnect(); });
  const read = () => readNextActions(workspaceId, options);
  async function add(count: number, scheduledAt = new Date("2026-10-31T18:00:00.000Z")) {
    const prefix = randomUUID(), ids = Array.from({ length: count }, (_, i) => `${prefix}-${String(i).padStart(4, "0")}`);
    await prisma.jump.createMany({ data: ids.map(id => ({ ...fixture, id, workspaceId, status: "PENDING", scheduledAt, reason: "One-time check-in", uniquenessKey: id, templateSnapshot: { oneTime: true }, renderedSnapshot: { body: "Unsent fixture" } })) });
    return ids;
  }
  async function work(state = emptyWorkflowState()) {
    return prisma.mixWorkflowInstance.create({ data: { workspaceId, contactId: fixture.contactId, admissionKey: randomUUID(), label: "Estimate follow-up", definition: definition as unknown as Prisma.InputJsonValue, state: state as unknown as Prisma.InputJsonValue } });
  }
  it("gives outcome-only Contacts and Today identical next actions, keeping multiple outcomes distinct", async () => {
    const state = emptyWorkflowState();
    state.evaluations = ["first", "second"].map(id => ({ id, ruleId: "decision", runId: id, visitId: null, occurredAt: now.toISOString(), outcome: null, decidedAt: null, generation: 0, status: "WAITING", joined: false }));
    await work(state);
    const today = await read(), contact = await readNextActions(workspaceId, { ...options, contactId: fixture.contactId });
    expect(today.items).toEqual(contact.items);
    expect(today.items[0].action).toBe("Record outcome");
    expect(today.attentionCount).toBe(2);
    expect(nextActionAttention(today)?.total).toBe(2);
  });
  it("shows overdue one-time work without enrollment, then hides completion and restores Undo", async () => {
    const [id] = await add(1);
    expect((await read()).items[0]).toMatchObject({ jumpId: id, action: "Review message", timing: "overdue" });
    expect(await prisma.mixAssignment.count({ where: { contactId: fixture.contactId } })).toBe(0);
    await prisma.jump.update({ where: { id }, data: { status: "DONE", completedAt: now } });
    expect((await read()).items).toEqual([]);
    await prisma.jump.update({ where: { id }, data: { status: "PENDING", completedAt: null } });
    expect((await read()).attentionCount).toBe(1);
  });
  it("deduplicates a held visit and its follow-up while retaining distinct repairs and commitments", async () => {
    const state = emptyWorkflowState();
    state.visits = ["first", "second"].map(id => ({ id, runId: "run", stepId: fixture.mixStepId, readyAt: now.toISOString(), status: "HELD", completedAt: null, outcome: null, reason: "Choose an appointment", parentTransitionId: null }));
    state.commitments = [{ id: "callback", updateId: "update", runId: "run", dueAt: now.toISOString(), timezone: "UTC", source: "CUSTOMER", recordedAt: now.toISOString(), status: "OPEN" }];
    const instance = await work(state);
    const [id] = await add(1);
    await prisma.jump.update({ where: { id }, data: { workflowInstanceId: instance.id, workflowVisitId: "first", updatedAt: new Date(now.getTime() + 1000) } });
    await prisma.mixWorkflowInstance.update({ where: { id: instance.id }, data: { updatedAt: now } });
    const result = await read();
    expect(result.attentionCount).toBe(3);
    expect(result.items.filter(item => item.kind === "repair")).toHaveLength(2);
    expect(result.items.find(item => item.id.endsWith(":first"))?.action).toBe("Choose a date");
    expect(result.items[0].kind).toBe("commitment");
    expect(nextActionAttention(result, 3000)?.offset).toBe(0);
  });
  it("retains future appointment and follow-up context while filtering totals from the full set", async () => {
    await add(325);
    await add(1, new Date("2026-11-04T17:00:00.000Z"));
    await prisma.calendarEntry.create({ data: { workspaceId, contactId: fixture.contactId, kind: "MEETING", title: "Site visit", startsAt: new Date("2026-11-03T17:00:00Z"), endsAt: new Date("2026-11-03T18:00:00Z"), timezone: "UTC" } });
    const all = await readNextActions(workspaceId, { ...options, followUpWhere: { scheduledAt: { lt: now } }, before: now });
    expect(all.items).toHaveLength(327);
    expect(all.futureCount).toBe(2);
    expect(nextActionsInView(all).attentionCount).toBe(325);
    expect(nextActionsInView(all).futureCount).toBe(0);
    expect((await readNextActions(workspaceId, { ...options, followUpWhere: { workspaceId: foreignId }, includeOtherActions: false })).items.filter(item => item.inView)).toEqual([]);
    expect((await readNextActions(foreignId, { ...options, contactId: fixture.contactId })).items).toEqual([]);
  });
  it("uses one snapshot while another device completes and deletes records between source pages", async () => {
    const ids = await add(251);
    let changed = false;
    const snapshot = await prisma.$transaction(async tx => {
      const jump = tx.jump;
      const jumps = new Proxy(jump, { get(target, name) {
        if (name !== "findMany") return Reflect.get(target, name);
        return async (args: Parameters<typeof tx.jump.findMany>[0]) => {
          const page = await jump.findMany(args);
          if (!changed) {
            changed = true;
            await prisma.jump.update({ where: { id: ids[250] }, data: { status: "DONE", completedAt: now } });
            await prisma.jump.delete({ where: { id: ids[249] } });
          }
          return page;
        };
      } });
      const reader = new Proxy(tx, { get(target, name) { return name === "jump" ? jumps : Reflect.get(target, name); } });
      return readNextActionSnapshot(reader, workspaceId, options);
    }, { isolationLevel: "RepeatableRead" });
    expect(snapshot.attentionCount).toBe(251);
    expect((await read()).attentionCount).toBe(249);
  });
  it("keeps archived/DNC restrictions and makes unreadable or failed preparation explicit", async () => {
    await add(1);
    await prisma.contactRelationshipState.create({ data: { workspaceId, contactId: fixture.contactId, doNotContact: true } });
    expect((await read()).items).toEqual([]);
    await prisma.contactRelationshipState.update({ where: { contactId: fixture.contactId }, data: { doNotContact: false } });
    await prisma.contact.update({ where: { id: fixture.contactId }, data: { archivedAt: now } });
    expect((await read()).items).toEqual([]);
    await prisma.contact.update({ where: { id: fixture.contactId }, data: { archivedAt: null } });
    const instance = await work();
    await prisma.mixWorkflowInstance.update({ where: { id: instance.id }, data: { state: { unreadable: true } } });
    expect((await read()).state).toBe("unavailable");
    await prisma.mixWorkflowInstance.delete({ where: { id: instance.id } });
    await prisma.jump.deleteMany({ where: { workspaceId } });
    const job = await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: {}, failedAt: now } });
    expect((await read()).state).toBe("failed");
    await prisma.job.update({ where: { id: job.id }, data: { failedAt: null } });
    expect((await read()).state).toBe("preparing");
    await prisma.job.delete({ where: { id: job.id } });
    expect(await read()).toMatchObject({ state: "ready", items: [] });
  });
});
