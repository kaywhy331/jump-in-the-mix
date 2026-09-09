import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { contactFollowUpSummary } from "../src/lib/contact-follow-up-summary";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("bounded contact history summaries on PostgreSQL", () => {
  const key = `summary-${randomUUID()}`;
  let userId: string;
  const spaces: string[] = [];
  let contactId: string, foreignContactId: string, emptyId: string, canceledId: string;
  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `${key}@example.test`, name: key } }); userId = user.id;
    for (let i = 0; i < 2; i++) {
      const workspace = await prisma.workspace.create({ data: { ownerId: user.id, name: key, slug: `${key}-${i}` } }); spaces.push(workspace.id);
      const contact = await prisma.contact.create({ data: { workspaceId: workspace.id, displayName: key } });
      if (i) foreignContactId = contact.id; else contactId = contact.id;
      const template = await prisma.stepTemplate.create({ data: { workspaceId: workspace.id, name: key, channel: "EMAIL" } });
      const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "private history" } });
      const mix = await prisma.mix.create({ data: { workspaceId: workspace.id, name: key, triggerMode: "MANUAL_START" } });
      const step = await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: version.id, sortOrder: 0, dayOffset: 0 } });
      const base = { workspaceId: workspace.id, contactId: contact.id, mixId: mix.id, mixStepId: step.id, stepVersionId: version.id, reason: key, templateSnapshot: { body: "private history" }, renderedSnapshot: { body: "private history" } };
      await prisma.jump.createMany({ data: Array.from({ length: 300 }, (_, n) => ({ ...base, uniquenessKey: `${key}-${i}-${n}`, scheduledAt: new Date(Date.UTC(2020, 0, n + 1)), completedAt: new Date(Date.UTC(2020, 0, n + 1)), status: "DONE" })) });
      await prisma.jump.createMany({ data: [
        { ...base, uniquenessKey: `${key}-${i}-skip`, status: "SKIPPED", scheduledAt: new Date("2021-01-01Z"), completedAt: new Date("2021-02-01Z") },
        { ...base, uniquenessKey: `${key}-${i}-canceled`, status: "CANCELED", scheduledAt: new Date("2010-01-01Z"), completedAt: new Date("2030-01-01Z") },
        { ...base, uniquenessKey: `${key}-${i}-next`, status: "PENDING", scheduledAt: new Date("2022-01-01Z") },
        { ...base, uniquenessKey: `${key}-${i}-later`, status: "PENDING", scheduledAt: new Date("2023-01-01Z") }
      ] });
      if (!i) {
        emptyId = (await prisma.contact.create({ data: { workspaceId: workspace.id, displayName: "No follow-ups" } })).id;
        canceledId = (await prisma.contact.create({ data: { workspaceId: workspace.id, displayName: "Canceled only" } })).id;
        await prisma.jump.create({ data: { ...base, contactId: canceledId, uniquenessKey: `${key}-only-canceled`, status: "CANCELED", scheduledAt: new Date("2024-01-01Z"), completedAt: new Date("2024-01-01Z") } });
      }
    }
  });
  afterAll(async () => { await prisma.workspace.deleteMany({ where: { id: { in: spaces } } }); if (userId) await prisma.user.delete({ where: { id: userId } }); await prisma.$disconnect(); });
  it("returns only the two displayed dates without transferring historical messages", async () => {
    const result = await contactFollowUpSummary(spaces[0], [contactId, contactId, emptyId, canceledId]);
    expect([...result.values()]).toEqual([{ contactId, lastInteraction: new Date("2021-02-01Z"), nextJump: new Date("2022-01-01Z") }]);
  });
  it("enforces workspace scope even when foreign contact IDs or SQL text are supplied", async () => {
    const result = await contactFollowUpSummary(spaces[0], [contactId, foreignContactId, "' OR true --"]);
    expect([...result.keys()]).toEqual([contactId]);
    expect(await contactFollowUpSummary(spaces[1], [contactId])).toEqual(new Map());
  });
  it("handles empty pages and bounds the requested page size", async () => {
    expect(await contactFollowUpSummary(spaces[0], [])).toEqual(new Map());
    await expect(contactFollowUpSummary(spaces[0], Array.from({ length: 51 }, (_, i) => `contact-${i}`))).rejects.toThrow("one contacts page");
  });
});
