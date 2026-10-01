import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/plans";
import { reconcileJumps } from "@/lib/jump-engine";
import { activeMixLimitRefusal, applyPeopleLimit, PLAN_LIMIT_STOP, recentPlanLimitSkips, reservePeople } from "@/lib/plan-limits";

// Plan limits (JITM-01 §2.9): only while billing is on; existing people keep their place; someone new beyond the
// people limit is skipped in that Mix; a Mega-Mix counts as one active Mix and the first follow-up Mix not at all.
const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const saved = { enabled: process.env.BILLING_ENABLED, key: process.env.STRIPE_SECRET_KEY, secret: process.env.STRIPE_WEBHOOK_SECRET };
const free = PLANS.find(plan => plan.id === "FREE")!;

function billingOn(on: boolean) {
  if (on) Object.assign(process.env, { BILLING_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_WEBHOOK_SECRET: "whsec_fixture" });
  else process.env.BILLING_ENABLED = "false";
}

describe.skipIf(!local)("plan limits", () => {
  let userId: string, workspaceId: string;

  async function people(count: number, prefix = "Person") {
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) ids.push((await prisma.contact.create({ data: { workspaceId, displayName: `${prefix} ${index}` } })).id);
    return ids;
  }
  async function mix(data: { status?: "ACTIVE" | "DRAFT" | "PAUSED"; source?: string } = {}) {
    return (await prisma.mix.create({ data: { workspaceId, name: `Mix ${randomUUID().slice(0, 6)}`, triggerMode: "MANUAL_START", status: data.status ?? "ACTIVE", source: data.source ?? "USER" } })).id;
  }
  async function assign(mixId: string, contactId: string) {
    await prisma.mixAssignment.create({ data: { assignmentKey: `${workspaceId}:${mixId}:${contactId}`, workspaceId, mixId, contactId } });
  }
  async function tag(contactIds: string[], mixId: string) {
    const group = await prisma.group.create({ data: { workspaceId, name: `Tag ${randomUUID().slice(0, 6)}`, memberships: { create: contactIds.map(contactId => ({ contactId })) } } });
    await prisma.mixAssignment.create({ data: { assignmentKey: `${workspaceId}:${mixId}:group:${group.id}`, workspaceId, mixId, groupId: group.id, mode: "DYNAMIC" } });
    return group.id;
  }
  const seats = () => prisma.planPerson.count({ where: { workspaceId } });
  const limitStops = () => prisma.mixStop.findMany({ where: { workspaceId, reason: PLAN_LIMIT_STOP }, select: { contactId: true, mixId: true } });

  beforeEach(async () => {
    billingOn(false);
    userId = (await prisma.user.create({ data: { name: "Limits fixture", email: `limits-${randomUUID()}@example.test` } })).id;
    workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Limits fixture", slug: randomUUID() } })).id;
  });
  afterEach(async () => {
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });
  afterAll(() => {
    for (const [name, value] of [["BILLING_ENABLED", saved.enabled], ["STRIPE_SECRET_KEY", saved.key], ["STRIPE_WEBHOOK_SECRET", saved.secret]] as const) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });

  it("counts everyone and skips no one while billing is off", async () => {
    const mixId = await mix();
    const ids = await people(free.people + 5);
    await tag(ids, mixId);
    await expect(applyPeopleLimit(workspaceId)).resolves.toMatchObject({ counted: free.people + 5, skipped: 0 });
    expect(await limitStops()).toEqual([]);
    expect(await activeMixLimitRefusal(workspaceId, { newUnits: 10 })).toBeNull();
  });

  it("keeps the people an account already has when billing starts, and skips someone new beyond the limit", async () => {
    const mixId = await mix();
    const ids = await people(free.people + 2);
    await tag(ids, mixId);
    await applyPeopleLimit(workspaceId);
    billingOn(true);
    // Everyone already counted keeps their follow-ups, even over the limit.
    await expect(applyPeopleLimit(workspaceId)).resolves.toMatchObject({ counted: free.people + 2, admitted: 0, skipped: 0 });

    const [newcomer] = await people(1, "New");
    const otherMix = await mix();
    await assign(otherMix, newcomer);
    await prisma.contactGroupMembership.create({ data: { contactId: newcomer, groupId: (await prisma.mixAssignment.findFirstOrThrow({ where: { workspaceId, mixId, groupId: { not: null } } })).groupId! } });
    await expect(applyPeopleLimit(workspaceId)).resolves.toMatchObject({ skipped: 1 });
    // Skipped in every Mix that would have started for them, and told on Today.
    expect((await limitStops()).map(stop => stop.mixId).sort()).toEqual([mixId, otherMix].sort());
    expect(await recentPlanLimitSkips(workspaceId)).toBe(1);
    // A skip is final for that Mix: the next pass doesn't count or retry them.
    await expect(applyPeopleLimit(workspaceId)).resolves.toMatchObject({ skipped: 0, counted: free.people + 2 });
  });

  it("admits the earliest newcomers while there is room, and frees a place when someone's Mixes end", async () => {
    billingOn(true);
    const mixId = await mix();
    const settled = await people(free.people - 1);
    for (const id of settled) await assign(mixId, id);
    await applyPeopleLimit(workspaceId);
    const [first, second] = await people(2, "New");
    await assign(mixId, first);
    await assign(mixId, second);
    await expect(applyPeopleLimit(workspaceId)).resolves.toMatchObject({ admitted: 1, skipped: 1 });
    expect((await limitStops()).map(stop => stop.contactId)).toEqual([second]);

    // Someone counted for more than ten minutes whose Mix ends leaves the count.
    await prisma.planPerson.updateMany({ where: { workspaceId }, data: { admittedAt: new Date(Date.now() - 60 * 60_000) } });
    await prisma.mixAssignment.updateMany({ where: { workspaceId, contactId: settled[0] }, data: { isActive: false } });
    await expect(applyPeopleLimit(workspaceId)).resolves.toMatchObject({ counted: free.people - 1 });
    // Starting someone yourself takes the free place, and the next one is refused.
    expect(await reservePeople(workspaceId, [second])).toBeNull();
    expect(await reservePeople(workspaceId, [settled[0]])).toMatch(/Free plan has room for 100 people/);
    // Someone who already has follow-ups on always fits.
    expect(await reservePeople(workspaceId, [first])).toBeNull();
    // Another account's person never takes a place here.
    await prisma.planPerson.deleteMany({ where: { workspaceId, contactId: second } });
    const otherUser = await prisma.user.create({ data: { name: "Other", email: `other-${randomUUID()}@example.test` } });
    const other = await prisma.workspace.create({ data: { ownerId: otherUser.id, name: "Other", slug: randomUUID() } });
    try {
      const foreign = (await prisma.contact.create({ data: { workspaceId: other.id, displayName: "Foreign" } })).id;
      expect(await reservePeople(workspaceId, [foreign, randomUUID()])).toBeNull();
      expect(await prisma.planPerson.count({ where: { contactId: foreign } })).toBe(0);
    } finally {
      await prisma.workspace.deleteMany({ where: { id: other.id } });
      await prisma.user.deleteMany({ where: { id: otherUser.id } });
    }
  });

  it("refuses a new active Mix beyond the plan, counting a Mega-Mix as one and leaving out the first follow-up Mix", async () => {
    billingOn(true);
    await mix({ source: "STARTER" });
    await mix({ source: "ONE_TIME" });
    const members = [await mix(), await mix(), await mix()];
    await prisma.megaMixPipeline.create({ data: { workspaceId, name: "Contractor", origin: "BLUEPRINT:contractor", createdById: userId, members: { create: members.map((mixId, position) => ({ mixId, position })) } } });
    await mix();
    // Two places used: the Mega-Mix and one Mix. A third fits; a fourth doesn't.
    expect(await activeMixLimitRefusal(workspaceId, { newUnits: 1 })).toBeNull();
    expect(await activeMixLimitRefusal(workspaceId, { newUnits: 2 })).toMatch(/Free plan allows 3 active Mixes/);
    const draft = await mix({ status: "DRAFT" });
    await mix();
    expect(await activeMixLimitRefusal(workspaceId, { mixIds: [draft] })).toMatch(/allows 3 active Mixes/);
    // A Mix of a Mega-Mix that already counts takes no new place.
    const pausedMember = await mix({ status: "PAUSED" });
    await prisma.megaMixPipelineMix.create({ data: { mixId: pausedMember, pipelineId: (await prisma.megaMixPipeline.findFirstOrThrow({ where: { workspaceId } })).id, position: 3 } });
    expect(await activeMixLimitRefusal(workspaceId, { mixIds: [pausedMember] })).toBeNull();
  });

  it("generates nothing for someone the limit skipped, from any pass of the engine", async () => {
    const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Check in", channel: "SMS" } });
    const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Hi" } });
    const mixId = await mix();
    await prisma.mixStep.create({ data: { mixId, stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } });
    const [welcome, late] = await people(2, "Engine");
    await assign(mixId, welcome);
    await reconcileJumps({ workspaceId, contactId: welcome });
    expect(await prisma.jump.count({ where: { workspaceId, contactId: welcome, status: "PENDING" } })).toBe(1);

    billingOn(true);
    const full = await people(free.people - 1, "Seated");
    await prisma.planPerson.createMany({ data: full.map(contactId => ({ workspaceId, contactId })) });
    await assign(mixId, late);
    // A pass filtered to one person still settles the limit for the whole account first.
    await reconcileJumps({ workspaceId, contactId: late });
    expect(await prisma.jump.count({ where: { workspaceId, contactId: late } })).toBe(0);
    expect(await limitStops()).toEqual([{ contactId: late, mixId }]);
    // The person already counted keeps their follow-up.
    await reconcileJumps({ workspaceId });
    expect(await prisma.jump.count({ where: { workspaceId, contactId: welcome, status: "PENDING" } })).toBe(1);
  });
});
