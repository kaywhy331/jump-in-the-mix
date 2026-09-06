import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { enableJourney, recordJourneyEvent } from "@/lib/journey";
import { configureJourneyRule, JourneyRuleConflict } from "@/lib/journey-configuration";
import { journeyRuleRevision } from "@/lib/journey-types";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("owner journey rule configuration", () => {
  let workspaceId: string, userId: string;
  let stages: Awaited<ReturnType<typeof prisma.journeyStage.findMany>>;
  const owned: string[] = [];
  beforeEach(async () => {
    const key = randomUUID();
    userId = (await prisma.user.create({ data: { email: `rule-config-${key}@example.com`, name: "Rule fixture" } })).id;
    workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Rule fixture", slug: `rule-config-${key}` } })).id;
    owned.push(workspaceId);
    await enableJourney(workspaceId);
    stages = await prisma.journeyStage.findMany({ where: { workspaceId }, orderBy: { position: "asc" } });
  });
  afterEach(async () => { await prisma.workspace.deleteMany({ where: { id: { in: owned.splice(0) } } }); await prisma.user.delete({ where: { id: userId } }); });
  afterAll(async () => { await prisma.$disconnect(); });
  const input = (fromStageId: string, toStageId: string, eventType = "CONVERSATION_STARTED", expectedRule = "null") => ({ workspaceId, actorUserId: userId, fromStageId, toStageId, eventType, afterDays: null, expectedRule });

  it("supports repeat-business moves to earlier stages without moving people when a rule is saved", async () => {
    const contact = await prisma.contact.create({ data: { workspaceId, displayName: "Repeat customer" } });
    await recordJourneyEvent({ workspaceId, contactId: contact.id, eventType: "MANUAL", eventKey: randomUUID(), targetStageId: stages[3].id, source: "Test" });
    await configureJourneyRule(input(stages[3].id, stages[1].id));
    expect((await prisma.contactJourney.findUniqueOrThrow({ where: { contactId: contact.id } })).stageId).toBe(stages[3].id);
    await recordJourneyEvent({ workspaceId, contactId: contact.id, eventType: "CONVERSATION_STARTED", eventKey: randomUUID(), source: "Test" });
    expect((await prisma.contactJourney.findUniqueOrThrow({ where: { contactId: contact.id } })).stageId).toBe(stages[1].id);
  });

  it("preserves the newer rule and its audit history when a stale tab saves or removes it", async () => {
    const rule = await prisma.journeyRule.findUniqueOrThrow({ where: { fromStageId_eventType: { fromStageId: stages[0].id, eventType: "CONVERSATION_STARTED" } } });
    const draft = input(stages[0].id, stages[2].id, rule.eventType, journeyRuleRevision(rule));
    await configureJourneyRule(draft);
    await expect(configureJourneyRule({ ...draft, toStageId: stages[3].id })).rejects.toMatchObject({ rule: { toStageId: stages[2].id } });
    await expect(configureJourneyRule({ ...draft, remove: true })).rejects.toBeInstanceOf(JourneyRuleConflict);
    expect((await prisma.journeyRule.findUniqueOrThrow({ where: { id: rule.id } })).toStageId).toBe(stages[2].id);
    expect(await prisma.auditLog.count({ where: { workspaceId, action: "journey.rule.configure" } })).toBe(1);
    const current = await prisma.journeyRule.findUniqueOrThrow({ where: { id: rule.id } });
    await configureJourneyRule({ ...draft, expectedRule: journeyRuleRevision(current), remove: true });
    expect(await prisma.journeyRule.findUnique({ where: { id: rule.id } })).toBeNull();
  });

  it("serializes competing new rules for the same trigger", async () => {
    const results = await Promise.allSettled([
      configureJourneyRule(input(stages[3].id, stages[0].id)),
      configureJourneyRule(input(stages[3].id, stages[1].id))
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const failed = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(JourneyRuleConflict);
    expect(await prisma.journeyRule.count({ where: { workspaceId, fromStageId: stages[3].id } })).toBe(1);
  });

  it("rejects foreign and retired stages, invalid timing, and missing edit evidence", async () => {
    const foreign = await prisma.workspace.create({ data: { ownerId: userId, name: "Foreign", slug: randomUUID() } }); owned.push(foreign.id);
    await enableJourney(foreign.id);
    const foreignStage = await prisma.journeyStage.findFirstOrThrow({ where: { workspaceId: foreign.id } });
    await expect(configureJourneyRule(input(stages[3].id, foreignStage.id))).rejects.toThrow("this business");
    await expect(configureJourneyRule(input(foreignStage.id, stages[0].id, "TIME_IN_STAGE"))).rejects.toThrow();
    await prisma.journeyStage.update({ where: { id: stages[2].id }, data: { isActive: false } });
    await expect(configureJourneyRule(input(stages[3].id, stages[2].id))).rejects.toThrow("available stages");
    for (const afterDays of [null, 0, 1.5, 3651]) await expect(configureJourneyRule({ ...input(stages[3].id, stages[0].id, "TIME_IN_STAGE"), afterDays })).rejects.toThrow("3,650");
    await expect(configureJourneyRule({ ...input(stages[3].id, stages[0].id), expectedRule: "" })).rejects.toBeInstanceOf(JourneyRuleConflict);
    expect(await prisma.auditLog.count({ where: { workspaceId, action: "journey.rule.configure" } })).toBe(0);
  });
});
