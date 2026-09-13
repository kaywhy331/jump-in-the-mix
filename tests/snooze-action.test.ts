import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ workspaceId: "", userId: "" }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => ({ workspace: { id: session.workspaceId }, user: { id: session.userId } }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));

import { reconcileJumps } from "../src/lib/jump-engine";
import { prisma } from "../src/lib/prisma";
import { snoozeJumpAction } from "../src/lib/snooze-actions";

async function snooze(fields: Record<string, string>): Promise<string> {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  try {
    await snoozeJumpAction(formData);
  } catch (error) {
    return (error as Error).message.replace(/^REDIRECT /, "");
  }
  throw new Error("The snooze action did not redirect.");
}

describe.sequential("the snooze command", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const ids: Record<string, string> = {};
  const now = new Date();
  const timezone = "America/Los_Angeles";

  async function broadcast(name: string, daysFromToday: number): Promise<string> {
    const template = await prisma.stepTemplate.create({ data: { workspaceId: ids.workspace, name, channel: "SMS" } });
    const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "Hi {{First Name}}" } });
    const mix = await prisma.mix.create({ data: { workspaceId: ids.workspace, name, triggerMode: "BROADCAST", status: "ACTIVE" } });
    await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } });
    await prisma.mixAssignment.create({
      data: { assignmentKey: `${ids.workspace}:${mix.id}:audience:${ids.contact}`, workspaceId: ids.workspace, mixId: mix.id, contactId: ids.contact, mode: "DYNAMIC" }
    });
    const localDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysFromToday, 12));
    await prisma.mixBroadcastSchedule.create({ data: { workspaceId: ids.workspace, mixId: mix.id, localDate, timeMinutes: 600, timezone } });
    await reconcileJumps({ workspaceId: ids.workspace, mixId: mix.id });
    return (await prisma.jump.findFirstOrThrow({ where: { workspaceId: ids.workspace, mixId: mix.id, status: "PENDING" } })).id;
  }

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { email: `command-${suffix}@example.com`, name: "Command Owner", passwordHash: "test-only" } });
    ids.user = user.id;
    const workspace = await prisma.workspace.create({ data: { name: "Command Workspace", slug: `command-${suffix}`, ownerId: user.id, profile: { create: {} } } });
    ids.workspace = workspace.id;
    session.workspaceId = workspace.id;
    session.userId = user.id;
    ids.contact = (await prisma.contact.create({ data: { workspaceId: workspace.id, firstName: "Alex", displayName: "Alex" } })).id;
    ids.overdue = await broadcast("Overdue", -3);
    ids.upcoming = await broadcast("Upcoming", 10);
  });

  afterAll(async () => {
    if (ids.workspace) {
      await prisma.mixBroadcastSchedule.deleteMany({ where: { workspaceId: ids.workspace } });
      await prisma.workspace.deleteMany({ where: { id: ids.workspace } });
    }
    if (ids.user) await prisma.user.deleteMany({ where: { id: ids.user } });
  });

  it("snoozes an overdue follow-up until tomorrow and the worker leaves it there", async () => {
    expect(await snooze({ jumpId: ids.overdue, preset: "tomorrow", returnTo: "/jumps" })).toBe("/jumps?snoozed=1");
    const after = await prisma.jump.findUniqueOrThrow({ where: { id: ids.overdue } });
    expect(after.snoozedUntil).not.toBeNull();
    expect(after.scheduledAt.toISOString()).toBe(after.snoozedUntil?.toISOString());
    expect(after.scheduledAt.getTime()).toBeGreaterThan(now.getTime());

    await reconcileJumps({ workspaceId: ids.workspace });
    const settled = await prisma.jump.findUniqueOrThrow({ where: { id: ids.overdue } });
    expect(settled.scheduledAt.toISOString()).toBe(after.scheduledAt.toISOString());
  });

  it("can move an already snoozed follow-up later again", async () => {
    const before = await prisma.jump.findUniqueOrThrow({ where: { id: ids.overdue } });
    expect(await snooze({ jumpId: ids.overdue, preset: "next-week", returnTo: "/jumps" })).toBe("/jumps?snoozed=1");
    const after = await prisma.jump.findUniqueOrThrow({ where: { id: ids.overdue } });
    expect(after.scheduledAt.getTime()).toBeGreaterThan(before.scheduledAt.getTime());
    expect(after.snoozedUntil?.toISOString()).toBe(after.scheduledAt.toISOString());
  });

  it("refuses to pull an upcoming follow-up ahead of its due time", async () => {
    const before = await prisma.jump.findUniqueOrThrow({ where: { id: ids.upcoming } });
    const destination = await snooze({ jumpId: ids.upcoming, preset: "tomorrow", returnTo: "/jumps" });
    expect(destination.startsWith("/jumps?error=")).toBe(true);
    expect(decodeURIComponent(destination)).toContain("Snooze can only move it later.");
    const after = await prisma.jump.findUniqueOrThrow({ where: { id: ids.upcoming } });
    expect(after.snoozedUntil).toBeNull();
    expect(after.scheduledAt.toISOString()).toBe(before.scheduledAt.toISOString());
  });

  it("reports a follow-up that is no longer pending", async () => {
    expect(decodeURIComponent(await snooze({ jumpId: "missing", preset: "tomorrow", returnTo: "/jumps" }))).toContain("no longer available to snooze");
  });
});
