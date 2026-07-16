import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reconcileJumps } from "../src/lib/jump-engine";
import { addLogicalDays, logicalDateFromDate, zonedDateTimeToUtc } from "../src/lib/jump-schedule";
import { prisma } from "../src/lib/prisma";

describe.sequential("fixed-date broadcast reconciliation", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const ids: Record<string, string> = {};
  const now = new Date();
  const firstLocalDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2, 12));

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `broadcast-${suffix}@example.com`, name: "Broadcast Owner", passwordHash: "test-only" } });
    ids.user = user.id;
    const workspace = await prisma.workspace.create({
      data: {
        name: "Broadcast Workspace",
        slug: `broadcast-${suffix}`,
        ownerId: user.id,
        profile: { create: { timezone: "America/Los_Angeles" } }
      }
    });
    ids.workspace = workspace.id;
    const definition = await prisma.contactCustomFieldDefinition.create({
      data: { workspaceId: workspace.id, name: "Account code", key: `account_code_${suffix.slice(0, 8)}` }
    });
    const contact = await prisma.contact.create({
      data: {
        workspaceId: workspace.id,
        firstName: "Jordan",
        displayName: "Jordan",
        customFieldValues: { create: { definitionId: definition.id, value: "AC-2048" } }
      }
    });
    ids.contact = contact.id;
    const template = await prisma.stepTemplate.create({ data: { workspaceId: workspace.id, name: "Broadcast SMS", channel: "SMS" } });
    const version = await prisma.stepVersion.create({
      data: { stepTemplateId: template.id, version: 1, body: `Hi {{First Name}} — {{contact.custom.${definition.key}}}` }
    });
    const mix = await prisma.mix.create({
      data: { workspaceId: workspace.id, name: "Fixed Broadcast", triggerMode: "BROADCAST", status: "ACTIVE" }
    });
    ids.mix = mix.id;
    await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } });
    await prisma.mixAssignment.create({
      data: {
        assignmentKey: `${workspace.id}:${mix.id}:audience:${contact.id}`,
        workspaceId: workspace.id,
        mixId: mix.id,
        contactId: contact.id,
        mode: "DYNAMIC"
      }
    });
    await prisma.mixBroadcastSchedule.create({
      data: {
        workspaceId: workspace.id,
        mixId: mix.id,
        localDate: firstLocalDate,
        timeMinutes: 600,
        timezone: "America/Los_Angeles"
      }
    });
  });

  afterAll(async () => {
    if (ids.workspace) {
      await prisma.mixBroadcastSchedule.deleteMany({ where: { workspaceId: ids.workspace } });
      await prisma.workspace.deleteMany({ where: { id: ids.workspace } });
    }
    if (ids.user) await prisma.user.deleteMany({ where: { id: ids.user } });
  });

  it("creates one personalized pending Jump at the fixed local schedule", async () => {
    const result = await reconcileJumps({ workspaceId: ids.workspace, mixId: ids.mix });
    expect(result.desired).toBe(1);
    expect(result.created).toBe(1);
    expect(result.canceled).toBe(0);

    const jump = await prisma.jump.findFirstOrThrow({ where: { workspaceId: ids.workspace, mixId: ids.mix, status: "PENDING" } });
    const expected = zonedDateTimeToUtc(logicalDateFromDate(firstLocalDate), 600, "America/Los_Angeles");
    expect(jump.scheduledAt.toISOString()).toBe(expected.toISOString());
    expect(jump.renderedSnapshot).toMatchObject({ body: "Hi Jordan — AC-2048" });
  });

  it("cancels the obsolete pending occurrence when the broadcast schedule changes", async () => {
    const secondLogicalDate = addLogicalDays(logicalDateFromDate(firstLocalDate), 1);
    const secondLocalDate = new Date(Date.UTC(secondLogicalDate.year, secondLogicalDate.month - 1, secondLogicalDate.day, 12));
    await prisma.mixBroadcastSchedule.update({
      where: { mixId: ids.mix },
      data: { localDate: secondLocalDate, timeMinutes: 690 }
    });

    const result = await reconcileJumps({ workspaceId: ids.workspace, mixId: ids.mix });
    expect(result.desired).toBe(1);
    expect(result.created).toBe(1);
    expect(result.canceled).toBe(1);

    const jumps = await prisma.jump.findMany({ where: { workspaceId: ids.workspace, mixId: ids.mix }, orderBy: { scheduledAt: "asc" } });
    expect(jumps).toHaveLength(2);
    expect(jumps.filter((jump) => jump.status === "CANCELED")).toHaveLength(1);
    const pending = jumps.find((jump) => jump.status === "PENDING");
    const expected = zonedDateTimeToUtc(secondLogicalDate, 690, "America/Los_Angeles");
    expect(pending?.scheduledAt.toISOString()).toBe(expected.toISOString());
  });
});
