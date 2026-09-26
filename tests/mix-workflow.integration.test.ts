import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { mergeWorkflowContact, processWorkflowInstance, queueWorkflowForJump, readWorkflowDefinition, saveWorkflowConfiguration, startWorkflowInstance, workflowState } from "@/lib/mix-workflow";
import { reconcileJumps } from "@/lib/jump-engine";
import { emptyWorkflow, type WorkflowConfiguration, type WorkflowRule } from "@/lib/mix-workflow-types";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("durable dynamic Mix journeys", () => {
  let workspaceId: string, userId: string, contactId: string, a: string, b: string, c: string;
  let now: Date;
  async function mix(name: string, days = [0]) {
    const created = await prisma.mix.create({ data: { workspaceId, name, status: "ACTIVE", triggerMode: "MANUAL_START" } });
    for (const [sortOrder, dayOffset] of days.entries()) {
      const template = await prisma.stepTemplate.create({ data: { workspaceId, name: `${name} Beat ${sortOrder + 1}`, channel: "SMS", versions: { create: { version: 1, body: "Hello {{First Name}}" } } }, include: { versions: true } });
      await prisma.mixStep.create({ data: { mixId: created.id, stepVersionId: template.versions[0].id, dayOffset, sortOrder } });
    }
    return created.id;
  }
  function rule(source: string, destinations: string[], options: Partial<WorkflowRule> = {}): WorkflowRule {
    const id = randomUUID(); return { id, name: "Configured path", source: { mixId: source, stepId: null }, enabled: true, mode: "PARALLEL", join: null,
      routes: destinations.map(destination => ({ id: randomUUID(), label: "Continue", when: "FINISHED", outcome: "", delayMinutes: 0, target: { mixId: destination, stepId: null }, maxVisits: null, replace: false })), ...options };
  }
  async function configure(rules: WorkflowRule[], extra: Partial<WorkflowConfiguration> = {}) {
    const current = await prisma.mixWorkflow.findUnique({ where: { workspaceId } });
    await prisma.$transaction(db => saveWorkflowConfiguration(db, workspaceId, { ...emptyWorkflow(), rules, ...extra }, current?.revision ?? 0, userId));
  }
  async function start(mixId = a, requestId = randomUUID()) {
    const id = await startWorkflowInstance({ workspaceId, contactId, mixId, requestId, now }); await processWorkflowInstance(workspaceId, id, now); return id;
  }
  async function complete(instanceId: string, mixId: string) {
    const jump = await prisma.jump.findFirstOrThrow({ where: { workflowInstanceId: instanceId, mixId, status: "PENDING" } });
    now = new Date(now.getTime() + 1000);
    await prisma.$transaction(async db => { await db.jump.update({ where: { id: jump.id }, data: { status: "DONE", completedAt: now, completionMethod: "outcome:completed" } }); await queueWorkflowForJump(db, workspaceId, jump.id); });
    now = new Date(now.getTime() + 11000); await processWorkflowInstance(workspaceId, instanceId, now); return jump;
  }
  beforeEach(async () => {
    now = new Date();
    const user = await prisma.user.create({ data: { email: `workflow-${randomUUID()}@example.com`, name: "Workflow test", emailVerifiedAt: now } }); userId = user.id;
    const workspace = await prisma.workspace.create({ data: { name: "Workflow test", slug: randomUUID(), ownerId: user.id } }); workspaceId = workspace.id;
    const contact = await prisma.contact.create({ data: { workspaceId, displayName: "Test person", firstName: "Test" } }); contactId = contact.id;
    a = await mix("First"); b = await mix("Second"); c = await mix("Third");
  });
  afterEach(async () => { await prisma.workspace.delete({ where: { id: workspaceId } }); await prisma.user.delete({ where: { id: userId } }); });
  afterAll(async () => { await prisma.$disconnect(); });

  it("commits one handoff despite concurrent workers and command retries", async () => {
    await configure([rule(a, [b])]); const requestId = randomUUID();
    const ids = await Promise.all([startWorkflowInstance({ workspaceId, contactId, mixId: a, requestId, now }), startWorkflowInstance({ workspaceId, contactId, mixId: a, requestId, now })]);
    expect(ids[0]).toBe(ids[1]); await processWorkflowInstance(workspaceId, ids[0], now); await complete(ids[0], a);
    await Promise.all([processWorkflowInstance(workspaceId, ids[0], now), processWorkflowInstance(workspaceId, ids[0], now)]);
    expect(await prisma.jump.count({ where: { workflowInstanceId: ids[0], mixId: b } })).toBe(1);
    expect(await prisma.job.count({ where: { workspaceId, task: "mix-workflow" } })).toBeGreaterThan(0);
  });
  it("runs the same Mix twice on one day for separate pieces of work", async () => {
    await configure([rule(a, [b])]); const one = await start(), two = await start();
    await complete(one, a);
    expect(await prisma.jump.count({ where: { workflowInstanceId: two, status: "PENDING", mixId: a } })).toBe(1);
    expect(await prisma.jump.count({ where: { workflowInstanceId: two, mixId: b } })).toBe(0);
    expect(await prisma.jump.count({ where: { workspaceId, mixId: a } })).toBe(2);
  });
  it("keeps workflow-owned work through legacy reconciliation", async () => {
    const id = await start(); await reconcileJumps({ workspaceId });
    expect(await prisma.jump.count({ where: { workflowInstanceId: id, status: "PENDING" } })).toBe(1);
  });
  it("adopts a scheduler occurrence and counts required Beats beyond its horizon", async () => {
    const long = await mix("Long horizon", [0, 365]);
    const future = await prisma.mixStep.findFirstOrThrow({ where: { mixId: long, dayOffset: 365 } });
    await prisma.mixStep.update({ where: { id: future.id }, data: { plannedAt: new Date(now.getTime() + 500 * 86400000) } });
    await configure([rule(long, [b])]);
    await prisma.mixAssignment.create({ data: { workspaceId, contactId, mixId: long, assignmentKey: randomUUID(), startDate: now } });
    await reconcileJumps({ workspaceId }); const jump = await prisma.jump.findFirstOrThrow({ where: { workspaceId, mixId: long } });
    expect(jump.workflowInstanceId).toBeTruthy();
    await complete(jump.workflowInstanceId!, long);
    const instance = await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id: jump.workflowInstanceId! } });
    expect(workflowState(instance.state).visits).toHaveLength(2);
    expect(await prisma.jump.count({ where: { workspaceId, mixId: b } })).toBe(0);
    expect(instance.status).toBe("ACTIVE");
  });
  it("snapshots existing runs while later starts use edited Beat wording", async () => {
    const id = await start(); const step = await prisma.mixStep.findFirstOrThrow({ where: { mixId: a } });
    const old = await prisma.stepVersion.findUniqueOrThrow({ where: { id: step.stepVersionId } });
    const version = await prisma.stepVersion.create({ data: { stepTemplateId: old.stepTemplateId, version: 2, body: "Different wording" } });
    await prisma.mixStep.update({ where: { id: step.id }, data: { stepVersionId: version.id } });
    await processWorkflowInstance(workspaceId, id, now); const next = await start();
    expect((await prisma.jump.findFirstOrThrow({ where: { workflowInstanceId: id } })).stepVersionId).toBe(old.id);
    expect((await prisma.jump.findFirstOrThrow({ where: { workflowInstanceId: next } })).stepVersionId).toBe(version.id);
  });
  it("holds and resumes an instance without restarting it or changing other work", async () => {
    const id = await start(), other = await start();
    await processWorkflowInstance(workspaceId, id, now, { requestId: randomUUID(), status: "PAUSED" });
    expect(await prisma.jump.count({ where: { workflowInstanceId: id, status: "PENDING" } })).toBe(0);
    expect(await prisma.jump.count({ where: { workflowInstanceId: other, status: "PENDING" } })).toBe(1);
    await processWorkflowInstance(workspaceId, id, now, { requestId: randomUUID(), status: "ACTIVE" });
    expect(await prisma.jump.count({ where: { workflowInstanceId: id, status: "PENDING" } })).toBe(1);
    expect(await prisma.jump.count({ where: { workflowInstanceId: id } })).toBe(1);
  });
  it("does not start a successor while the contact is restricted", async () => {
    await configure([rule(a, [b])]); const id = await start();
    await prisma.contactRelationshipState.create({ data: { workspaceId, contactId, doNotContact: true } });
    await complete(id, a);
    expect(await prisma.jump.count({ where: { workflowInstanceId: id, mixId: b } })).toBe(0);
  });
  it("records a custom decision once and rejects stale corrections", async () => {
    const connection = rule(a, [b, c], { mode: "CHOICE" }); connection.routes.forEach((route, index) => { route.when = "OUTCOME"; route.outcome = `My option ${index}`; });
    await configure([connection]); const id = await start(); await complete(id, a);
    const row = await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id } }); const evaluationId = workflowState(row.state).evaluations[0].id;
    const command = { requestId: randomUUID(), expectedRevision: row.revision, evaluationId, outcome: "My option 1" };
    await processWorkflowInstance(workspaceId, id, now, command); await processWorkflowInstance(workspaceId, id, now, command);
    expect(await prisma.jump.count({ where: { workflowInstanceId: id, mixId: c } })).toBe(1);
    await expect(processWorkflowInstance(workspaceId, id, now, { ...command, requestId: randomUUID(), outcome: "My option 0" })).rejects.toThrow("changed");
  });
  it("joins parallel branches in the same instance without unrelated completions", async () => {
    const d = await mix("Join target"); await configure([rule(a, [b, c], { join: { mode: "ALL", target: { mixId: d, stepId: null }, cancelRemaining: false } })]);
    const id = await start(), other = await start(c); await complete(id, a); await complete(id, b); await complete(other, c);
    expect(await prisma.jump.count({ where: { workflowInstanceId: id, mixId: d } })).toBe(0);
    await complete(id, c); expect(await prisma.jump.count({ where: { workflowInstanceId: id, mixId: d } })).toBe(1);
  });
  it("enforces tenant boundaries and optimistic configuration revisions", async () => {
    await configure([rule(a, [b])]);
    await expect(prisma.$transaction(db => saveWorkflowConfiguration(db, workspaceId, emptyWorkflow(), 0, userId))).rejects.toThrow("changed");
    const invalid = rule(a, ["foreign-mix"]); await expect(configure([invalid])).rejects.toThrow("account");
    const id = await start(); await expect(processWorkflowInstance("foreign-workspace", id)).rejects.toThrow("unavailable");
    expect((await readWorkflowDefinition(prisma, workspaceId)).rules).toHaveLength(1);
  });
  it("discards a queued decision after Undo even if the same Beat finishes again", async () => {
    const step = await prisma.mixStep.findFirstOrThrow({ where: { mixId: a } });
    const connection = rule(a, [b], { mode: "CHOICE", source: { mixId: a, stepId: step.id } });
    connection.routes[0].when = "OUTCOME"; connection.routes[0].outcome = "Continue";
    await configure([connection]); const id = await start();
    const jump = await complete(id, a);
    const completed = await prisma.jump.findUniqueOrThrow({ where: { id: jump.id } });
    const stale = { requestId: randomUUID(), visitId: completed.workflowVisitId!, sourceCompletedAt: completed.completedAt!.toISOString(), decisions: [{ ruleId: connection.id, outcome: "Continue" }] };
    await prisma.jump.update({ where: { id: jump.id }, data: { status: "PENDING", completedAt: null } });
    await processWorkflowInstance(workspaceId, id, now);
    await complete(id, a);
    await processWorkflowInstance(workspaceId, id, now, stale);
    expect(await prisma.jump.count({ where: { workflowInstanceId: id, mixId: b } })).toBe(0);
    expect(workflowState((await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id } })).state).evaluations[0].outcome).toBeNull();
  });
  it("holds only owned descendants when a source Mix is stopped", async () => {
    await configure([rule(a, [b])]); const id = await start(), independent = await start(b); await complete(id, a);
    await prisma.mixStop.create({ data: { workspaceId, contactId, mixId: a, reason: "journey.stage.exit" } });
    await processWorkflowInstance(workspaceId, id, now); await processWorkflowInstance(workspaceId, independent, now);
    expect(await prisma.jump.count({ where: { workflowInstanceId: id, mixId: b, status: "PENDING" } })).toBe(0);
    expect(await prisma.jump.count({ where: { workflowInstanceId: independent, mixId: b, status: "PENDING" } })).toBe(1);
  });
  it("keeps distinct workflow instances when contacts merge", async () => {
    await configure([rule(a, [b])]); const id = await start();
    const survivor = await prisma.contact.create({ data: { workspaceId, displayName: "Survivor" } });
    await prisma.$transaction(db => mergeWorkflowContact(db, workspaceId, contactId, survivor.id));
    await prisma.contact.delete({ where: { id: contactId } });
    await reconcileJumps({ workspaceId }); await complete(id, a);
    const rows = await prisma.jump.findMany({ where: { workflowInstanceId: id } });
    expect(rows).toHaveLength(2); expect(rows.every(jump => jump.contactId === survivor.id)).toBe(true);
  });
  it("explains an appointment-dependent Beat instead of silently dropping it", async () => {
    const step = await prisma.mixStep.findFirstOrThrow({ where: { mixId: b } });
    await prisma.mixStep.update({ where: { id: step.id }, data: { anchor: "VISIT_COMPLETED", offsetMinutes: 60 } });
    await configure([rule(a, [b])]); const id = await start(); await complete(id, a);
    const row = await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id } });
    expect(workflowState(row.state).visits.find(visit => visit.stepId === step.id)?.reason).toContain("appointment");
    expect(await prisma.jump.count({ where: { workflowInstanceId: id, mixId: b } })).toBe(0);
  });
  it("links an appointment, waits for its outcome and keeps its Beat under manual review", async () => {
    const step = await prisma.mixStep.findFirstOrThrow({ where: { mixId: b } });
    await prisma.mixStep.update({ where: { id: step.id }, data: { anchor: "VISIT_COMPLETED", offsetMinutes: 0 } });
    await configure([rule(a, [b])]); const id = await start(); await complete(id, a);
    const entry = await prisma.calendarEntry.create({ data: { workspaceId, contactId, title: "Configured appointment", kind: "VISIT", startsAt: now, endsAt: new Date(now.getTime() + 3600000), timezone: "UTC" } });
    await processWorkflowInstance(workspaceId, id, now, { requestId: randomUUID(), calendarEntryId: entry.id });
    expect(await prisma.jump.count({ where: { workflowInstanceId: id, mixId: b } })).toBe(0);
    await prisma.calendarEntry.update({ where: { id: entry.id }, data: { outcome: "COMPLETED", outcomeAt: now } });
    await processWorkflowInstance(workspaceId, id, now);
    expect((await prisma.jump.findFirstOrThrow({ where: { workflowInstanceId: id, mixId: b } })).manualOnly).toBe(true);
  });
  it("stopping an instance cancels pending work permanently but retains finished work", async () => {
    await configure([rule(a, [b])]); const id = await start(); await complete(id, a);
    await processWorkflowInstance(workspaceId, id, now, { requestId: randomUUID(), status: "STOPPED" });
    const state = workflowState((await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id } })).state);
    expect(state.visits.filter(visit => visit.status === "DONE")).toHaveLength(1);
    expect(state.visits.filter(visit => visit.status === "CANCELED")).toHaveLength(1);
    await expect(processWorkflowInstance(workspaceId, id, now, { requestId: randomUUID(), status: "ACTIVE" })).rejects.toThrow("stopped");
  });
  it("retains a completion decision through a pause and applies it once on resume", async () => {
    const connection = rule(a, [b], { mode: "CHOICE" }); connection.routes[0].when = "OUTCOME"; connection.routes[0].outcome = "Ready";
    await configure([connection]); const id = await start();
    const jump = await prisma.jump.findFirstOrThrow({ where: { workflowInstanceId: id } });
    now = new Date(now.getTime() + 1000);
    await prisma.$transaction(async db => {
      await db.jump.update({ where: { id: jump.id }, data: { status: "DONE", completedAt: now } });
      await queueWorkflowForJump(db, workspaceId, jump.id, [{ ruleId: connection.id, outcome: "Ready" }], randomUUID());
    });
    const job = await prisma.job.findFirstOrThrow({ where: { workspaceId, task: "mix-workflow", payload: { path: ["visitId"], equals: jump.workflowVisitId! } } });
    now = new Date(now.getTime() + 11000);
    await processWorkflowInstance(workspaceId, id, now, { requestId: randomUUID(), status: "PAUSED" });
    await processWorkflowInstance(workspaceId, id, now, job.payload as unknown as import("@/lib/mix-workflow").WorkflowCommand);
    expect(await prisma.jump.count({ where: { workflowInstanceId: id, mixId: b } })).toBe(0);
    await processWorkflowInstance(workspaceId, id, now, { requestId: randomUUID(), status: "ACTIVE" });
    expect(await prisma.jump.count({ where: { workflowInstanceId: id, mixId: b } })).toBe(1);
    expect(workflowState((await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id } })).state).pendingChoices).toEqual([]);
  });
  it("wakes an entirely finished instance after Undo without creating a new visit", async () => {
    const id = await start(); const jump = await complete(id, a);
    expect((await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id } })).status).toBe("FINISHED");
    await prisma.$transaction(async db => { await db.jump.update({ where: { id: jump.id }, data: { status: "PENDING", completedAt: null } }); await queueWorkflowForJump(db, workspaceId, jump.id); });
    await processWorkflowInstance(workspaceId, id, now);
    expect((await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id } })).status).toBe("ACTIVE");
    expect(await prisma.jump.count({ where: { workflowInstanceId: id } })).toBe(1);
  });
  it("applies a committed decision before maintenance can dispatch a silence path", async () => {
    const connection = rule(a, [b, c], { mode: "CHOICE" });
    connection.routes[0].when = "OUTCOME"; connection.routes[0].outcome = "Ready";
    connection.routes[1].when = "TIMEOUT"; connection.routes[1].delayMinutes = 1;
    await configure([connection]); const id = await start(); const jump = await prisma.jump.findFirstOrThrow({ where: { workflowInstanceId: id } });
    now = new Date(now.getTime() + 1000); const requestId = randomUUID();
    await prisma.$transaction(async db => { await db.jump.update({ where: { id: jump.id }, data: { status: "DONE", completedAt: now } }); await queueWorkflowForJump(db, workspaceId, jump.id, [{ ruleId: connection.id, outcome: "Ready" }], requestId); });
    now = new Date(now.getTime() + 120000);
    await processWorkflowInstance(workspaceId, id, now);
    expect(await prisma.jump.count({ where: { workflowInstanceId: id, mixId: c } })).toBe(0);
    expect(await prisma.jump.count({ where: { workflowInstanceId: id, mixId: b } })).toBe(1);
    expect(workflowState((await prisma.mixWorkflowInstance.findUniqueOrThrow({ where: { id } })).state).commands).toContain(requestId);
  });
  it("cascades workflow records with account removal", async () => {
    await configure([rule(a, [b])]); await start();
    await prisma.contact.delete({ where: { id: contactId } });
    expect(await prisma.mixWorkflowInstance.count({ where: { workspaceId } })).toBe(0);
  });
});
