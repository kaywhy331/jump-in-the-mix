import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emptyWorkflow, type WorkflowRule } from "@/lib/mix-workflow-types";

const { prisma } = await import("../src/lib/prisma");
const { mixEndQuestion } = await import("../src/lib/mix-end-question");

describe.sequential("asking what's next when a Mix ends with nothing after it (JITM-09 §2.77)", () => {
  const suffix = randomUUID().replaceAll("-", "");
  let userId = "";
  let workspaceId = "";
  let dateTypeId = "";
  type TestMix = { id: string; name: string; steps: Array<{ id: string; versionId: string }> };

  async function mix(name: string, beats = 1, data: Record<string, unknown> = {}): Promise<TestMix> {
    const created = await prisma.mix.create({ data: { workspaceId, name, status: "ACTIVE", triggerMode: "MANUAL_START", ...data } });
    const steps = [];
    for (let index = 0; index < beats; index += 1) {
      const template = await prisma.stepTemplate.create({ data: { workspaceId, name: `${name} ${index + 1}`, channel: "SMS", versions: { create: { version: 1, body: "Checking in" } } }, include: { versions: true } });
      const step = await prisma.mixStep.create({ data: { mixId: created.id, stepVersionId: template.versions[0].id, dayOffset: index * 3, sortOrder: index + 1 } });
      steps.push({ id: step.id, versionId: template.versions[0].id });
    }
    return { id: created.id, name, steps };
  }
  async function person(name: string) {
    return (await prisma.contact.create({ data: { workspaceId, displayName: `${name} ${suffix.slice(0, 6)}` } })).id;
  }
  async function start(contactId: string, target: TestMix) {
    await prisma.mixAssignment.create({ data: { workspaceId, mixId: target.id, contactId, assignmentKey: `${workspaceId}:${target.id}:${contactId}`, startDate: new Date(Date.now() - 60_000) } });
  }
  async function beat(contactId: string, target: TestMix, index: number, status: "PENDING" | "DONE" | "SKIPPED") {
    const step = target.steps[index];
    return (await prisma.jump.create({ data: {
      workspaceId, contactId, mixId: target.id, mixStepId: step.id, stepVersionId: step.versionId,
      scheduledAt: new Date(), reason: "Check in", status, completedAt: status === "PENDING" ? null : new Date(),
      uniquenessKey: `mix-end-${randomUUID()}`, templateSnapshot: { channel: "SMS", body: "Hi" }, renderedSnapshot: { body: "Hi" }
    } })).id;
  }
  const ask = (jumpId: string) => mixEndQuestion(workspaceId, jumpId);

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `mix-end-${suffix}@example.com`, name: "Mix End", passwordHash: "test-only", emailVerifiedAt: new Date() } });
    userId = user.id;
    workspaceId = (await prisma.workspace.create({ data: { name: "Mix end", slug: `mix-end-${suffix}`, ownerId: user.id, profile: { create: {} } } })).id;
    dateTypeId = (await prisma.dateType.create({ data: { workspaceId, scopeKey: workspaceId, name: "Renewal", slug: `renewal-${suffix}` } })).id;
  });

  afterAll(async () => {
    if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
  });

  it("asks once the last open Beat is finished, and not before", async () => {
    const estimate = await mix("Estimate follow-up", 2);
    const casey = await person("Casey");
    await start(casey, estimate);
    const first = await beat(casey, estimate, 0, "DONE");
    const second = await beat(casey, estimate, 1, "PENDING");
    expect(await ask(first)).toBeNull();
    await prisma.jump.update({ where: { id: second }, data: { status: "SKIPPED", completedAt: new Date() } });
    expect(await ask(second)).toEqual({ contactId: casey, contactName: `Casey ${suffix.slice(0, 6)}`, mixName: "Estimate follow-up", stillInMix: false });
    // Reopening the Beat means the Mix hasn't ended.
    await prisma.jump.update({ where: { id: second }, data: { status: "PENDING", completedAt: null } });
    expect(await ask(second)).toBeNull();
  });

  it("waits while a Beat has not come due yet, such as one timed from a visit", async () => {
    const visit = await mix("After the visit", 2);
    const drew = await person("Drew");
    await start(drew, visit);
    expect(await ask(await beat(drew, visit, 0, "DONE"))).toBeNull();
  });

  it("leaves it to a connection when the Mix has one after it", async () => {
    const welcome = await mix("Welcome", 1);
    const morgan = await person("Morgan");
    await start(morgan, welcome);
    const done = await beat(morgan, welcome, 0, "DONE");
    expect(await ask(done)).not.toBeNull();
    const rule: WorkflowRule = { id: randomUUID(), name: "After Welcome", source: { mixId: welcome.id, stepId: null }, enabled: true, mode: "PARALLEL", join: null,
      routes: [{ id: randomUUID(), label: "After this Mix finishes", when: "FINISHED", outcome: "", delayMinutes: 0, target: null, maxVisits: null, replace: false }] };
    await prisma.mixWorkflow.create({ data: { workspaceId, configuration: JSON.parse(JSON.stringify({ ...emptyWorkflow(), rules: [rule] })) } });
    expect(await ask(done)).toBeNull();
    await prisma.mixWorkflow.update({ where: { workspaceId }, data: { configuration: JSON.parse(JSON.stringify({ ...emptyWorkflow(), rules: [{ ...rule, enabled: false }] })) } });
    expect(await ask(done)).not.toBeNull();
  });

  it("says when the person is still in another Mix", async () => {
    const intro = await mix("Intro", 1);
    const nurture = await mix("Nurture", 1);
    const riley = await person("Riley");
    await start(riley, intro);
    await start(riley, nurture);
    const done = await beat(riley, intro, 0, "DONE");
    await beat(riley, nurture, 0, "PENDING");
    expect(await ask(done)).toMatchObject({ mixName: "Intro", stillInMix: true });
  });

  it("never asks about one-time follow-ups, a date that comes back, Do not contact or archived people", async () => {
    const oneTime = await mix("One-time", 1, { source: "ONE_TIME" });
    const renewal = await mix("Renewal", 1, { triggerMode: "DATE_TRIGGERED", dateTypeId });
    const sam = await person("Sam");
    expect(await ask(await beat(sam, oneTime, 0, "DONE"))).toBeNull();

    const jo = await person("Jo");
    await start(jo, renewal);
    await prisma.jumpDate.create({ data: { workspaceId, contactId: jo, dateTypeId, dateValue: new Date("2025-03-01T12:00:00Z"), month: 3, day: 1, recurrence: "YEARLY", timezone: "UTC" } });
    expect(await ask(await beat(jo, renewal, 0, "DONE"))).toBeNull();

    const welcome = await mix("Short welcome", 1);
    const quinn = await person("Quinn");
    await start(quinn, welcome);
    const done = await beat(quinn, welcome, 0, "DONE");
    await prisma.contactRelationshipState.create({ data: { workspaceId, contactId: quinn, doNotContact: true } });
    expect(await ask(done)).toBeNull();

    const avery = await person("Avery");
    await start(avery, welcome);
    const finished = await beat(avery, welcome, 0, "DONE");
    await prisma.contact.update({ where: { id: avery }, data: { archivedAt: new Date() } });
    expect(await ask(finished)).toBeNull();
  });

  it("only reads the workspace's own follow-ups", async () => {
    const other = await prisma.workspace.create({ data: { name: "Mix end other", slug: `mix-end-other-${suffix}`, ownerId: userId, profile: { create: {} } } });
    try {
      const welcome = await mix("Welcome back", 1);
      const lee = await person("Lee");
      await start(lee, welcome);
      const done = await beat(lee, welcome, 0, "DONE");
      expect(await mixEndQuestion(other.id, done)).toBeNull();
    } finally {
      await prisma.workspace.delete({ where: { id: other.id } });
    }
  });
});
