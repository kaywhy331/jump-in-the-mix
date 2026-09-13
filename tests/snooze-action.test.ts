import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ workspaceId: "", userId: "" }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => ({ workspace: { id: session.workspaceId }, user: { id: session.userId } }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));

import { reconcileJumps } from "../src/lib/jump-engine";
import { prisma } from "../src/lib/prisma";
import { snoozeJumpAction } from "../src/lib/snooze-actions";
import { createBroadcastFixture, type BroadcastFixture } from "./helpers/broadcast-fixture";

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
  let fixture: BroadcastFixture;
  let overdue: string;
  let upcoming: string;
  const now = new Date();

  async function pendingFor(name: string, daysFromToday: number): Promise<string> {
    const mixId = await fixture.addBroadcast(name, daysFromToday);
    await reconcileJumps({ workspaceId: fixture.workspaceId, mixId });
    return (await prisma.jump.findFirstOrThrow({ where: { workspaceId: fixture.workspaceId, mixId, status: "PENDING" } })).id;
  }

  beforeAll(async () => {
    fixture = await createBroadcastFixture("command");
    session.workspaceId = fixture.workspaceId;
    session.userId = fixture.userId;
    overdue = await pendingFor("Overdue", -3);
    upcoming = await pendingFor("Upcoming", 10);
  });
  afterAll(() => fixture.cleanup());

  it("snoozes an overdue follow-up until tomorrow and the worker leaves it there", async () => {
    expect(await snooze({ jumpId: overdue, preset: "tomorrow", returnTo: "/jumps" })).toBe("/jumps?snoozed=1");
    const after = await prisma.jump.findUniqueOrThrow({ where: { id: overdue } });
    expect(after.snoozedUntil).not.toBeNull();
    expect(after.scheduledAt.toISOString()).toBe(after.snoozedUntil?.toISOString());
    expect(after.scheduledAt.getTime()).toBeGreaterThan(now.getTime());

    await reconcileJumps({ workspaceId: fixture.workspaceId });
    const settled = await prisma.jump.findUniqueOrThrow({ where: { id: overdue } });
    expect(settled.status).toBe("PENDING");
    expect(settled.scheduledAt.toISOString()).toBe(after.scheduledAt.toISOString());
  });

  it("can move an already snoozed follow-up later again", async () => {
    const before = await prisma.jump.findUniqueOrThrow({ where: { id: overdue } });
    expect(await snooze({ jumpId: overdue, preset: "next-week", returnTo: "/jumps" })).toBe("/jumps?snoozed=1");
    const after = await prisma.jump.findUniqueOrThrow({ where: { id: overdue } });
    expect(after.scheduledAt.getTime()).toBeGreaterThan(before.scheduledAt.getTime());
    expect(after.snoozedUntil?.toISOString()).toBe(after.scheduledAt.toISOString());
  });

  it("refuses to pull an upcoming follow-up ahead of its due time", async () => {
    const before = await prisma.jump.findUniqueOrThrow({ where: { id: upcoming } });
    const destination = await snooze({ jumpId: upcoming, preset: "tomorrow", returnTo: "/jumps" });
    expect(destination.startsWith("/jumps?error=")).toBe(true);
    expect(decodeURIComponent(destination)).toContain("Snooze can't move it earlier than that.");
    const after = await prisma.jump.findUniqueOrThrow({ where: { id: upcoming } });
    expect(after.snoozedUntil).toBeNull();
    expect(after.scheduledAt.toISOString()).toBe(before.scheduledAt.toISOString());
  });

  it("reports a follow-up that is no longer pending", async () => {
    expect(decodeURIComponent(await snooze({ jumpId: "missing", preset: "tomorrow", returnTo: "/jumps" }))).toContain("no longer available to snooze");
  });
});
