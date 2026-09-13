import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Deterministic races: the hook runs after the reconciler has read the existing rows and before it
// writes, standing in for an owner action or another worker that lands in that gap.
const race = vi.hoisted(() => ({ afterExistingRead: null as null | (() => Promise<void>) }));

vi.mock("@/lib/prisma", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/prisma")>();
  const real = actual.prisma;
  const bound = (target: object, prop: PropertyKey) => {
    const value = Reflect.get(target, prop);
    return typeof value === "function" ? value.bind(target) : value;
  };
  const jump = new Proxy(real.jump, {
    get(target, prop) {
      if (prop !== "findMany") return bound(target, prop);
      return async (args: { where?: Record<string, unknown> }) => {
        const rows = await target.findMany(args as never);
        const hook = race.afterExistingRead;
        if (hook && args?.where && "uniquenessKey" in args.where) {
          race.afterExistingRead = null;
          await hook();
        }
        return rows;
      };
    }
  });
  const prisma = new Proxy(real, { get(target, prop) { return prop === "jump" ? jump : bound(target, prop); } });
  return { ...actual, prisma };
});

import { reconcileJumps } from "../src/lib/jump-engine";
import { prisma } from "../src/lib/prisma";

const DAY = 24 * 60 * 60 * 1000;

describe.sequential("reconciliation never overwrites what the owner did in the meantime", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const ids: Record<string, string> = {};
  const now = new Date();
  const localDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3, 12));

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `race-${suffix}@example.com`, name: "Race Owner", passwordHash: "test-only" } });
    ids.user = user.id;
    const workspace = await prisma.workspace.create({ data: { name: "Race Workspace", slug: `race-${suffix}`, ownerId: user.id, profile: { create: {} } } });
    ids.workspace = workspace.id;
    const contact = await prisma.contact.create({ data: { workspaceId: workspace.id, firstName: "Alex", displayName: "Alex" } });
    ids.contact = contact.id;
    const template = await prisma.stepTemplate.create({ data: { workspaceId: workspace.id, name: "Race SMS", channel: "SMS" } });
    const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Hi {{First Name}}" } });
    const mix = await prisma.mix.create({ data: { workspaceId: workspace.id, name: "Race Broadcast", triggerMode: "BROADCAST", status: "ACTIVE" } });
    ids.mix = mix.id;
    await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } });
    await prisma.mixAssignment.create({
      data: { assignmentKey: `${workspace.id}:${mix.id}:audience:${contact.id}`, workspaceId: workspace.id, mixId: mix.id, contactId: contact.id, mode: "DYNAMIC" }
    });
    await prisma.mixBroadcastSchedule.create({ data: { workspaceId: workspace.id, mixId: mix.id, localDate, timeMinutes: 600, timezone: "America/Los_Angeles" } });
    await reconcileJumps({ workspaceId: workspace.id });
    ids.jump = (await prisma.jump.findFirstOrThrow({ where: { workspaceId: workspace.id, status: "PENDING" } })).id;
  });

  afterAll(async () => {
    race.afterExistingRead = null;
    if (ids.workspace) {
      await prisma.mixBroadcastSchedule.deleteMany({ where: { workspaceId: ids.workspace } });
      await prisma.workspace.deleteMany({ where: { id: ids.workspace } });
    }
    if (ids.user) await prisma.user.deleteMany({ where: { id: ids.user } });
  });

  it("a snooze recorded after the read wins, and the pending refresh lands on the next pass", async () => {
    const until = new Date(now.getTime() + 2 * DAY);
    await prisma.contact.update({ where: { id: ids.contact }, data: { firstName: "Alexandra", displayName: "Alexandra" } });
    race.afterExistingRead = async () => {
      await prisma.jump.update({ where: { id: ids.jump }, data: { scheduledAt: until, snoozedUntil: until } });
    };
    const stale = await reconcileJumps({ workspaceId: ids.workspace });
    const afterStale = await prisma.jump.findUniqueOrThrow({ where: { id: ids.jump } });
    expect(race.afterExistingRead).toBeNull();
    expect(stale.updated).toBe(0);
    expect(afterStale.scheduledAt.toISOString()).toBe(until.toISOString());
    expect(afterStale.snoozedUntil?.toISOString()).toBe(until.toISOString());
    expect(afterStale.renderedSnapshot).toMatchObject({ body: "Hi Alex" });

    const fresh = await reconcileJumps({ workspaceId: ids.workspace });
    const afterFresh = await prisma.jump.findUniqueOrThrow({ where: { id: ids.jump } });
    expect(fresh.updated).toBe(1);
    expect(afterFresh.renderedSnapshot).toMatchObject({ body: "Hi Alexandra" });
    expect(afterFresh.scheduledAt.toISOString()).toBe(until.toISOString());
  });

  it("a stop recorded after the read is not resurrected", async () => {
    await prisma.contact.update({ where: { id: ids.contact }, data: { firstName: "Lex", displayName: "Lex" } });
    const stoppedAt = new Date();
    race.afterExistingRead = async () => {
      await prisma.jump.update({ where: { id: ids.jump }, data: { status: "CANCELED", completedAt: stoppedAt, completionMethod: "mix_stopped_for_contact" } });
    };
    const result = await reconcileJumps({ workspaceId: ids.workspace });
    const after = await prisma.jump.findUniqueOrThrow({ where: { id: ids.jump } });
    expect(race.afterExistingRead).toBeNull();
    expect(result.updated).toBe(0);
    expect(after.status).toBe("CANCELED");
    expect(after.completionMethod).toBe("mix_stopped_for_contact");
    expect(after.completedAt?.toISOString()).toBe(stoppedAt.toISOString());
  });

  it("a completion recorded after the read is not reopened", async () => {
    await prisma.jump.update({ where: { id: ids.jump }, data: { status: "PENDING", completedAt: null, completionMethod: null } });
    await prisma.contact.update({ where: { id: ids.contact }, data: { firstName: "Alexis", displayName: "Alexis" } });
    const doneAt = new Date();
    race.afterExistingRead = async () => {
      await prisma.jump.update({ where: { id: ids.jump }, data: { status: "DONE", completedAt: doneAt, completionMethod: "outcome:completed" } });
    };
    const result = await reconcileJumps({ workspaceId: ids.workspace });
    const after = await prisma.jump.findUniqueOrThrow({ where: { id: ids.jump } });
    expect(result.updated).toBe(0);
    expect(after.status).toBe("DONE");
    expect(after.completedAt?.toISOString()).toBe(doneAt.toISOString());
  });
});
