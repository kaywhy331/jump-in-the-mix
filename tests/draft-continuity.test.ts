import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reconcileJumps } from "../src/lib/jump-engine";
import { saveJumpDraft } from "../src/lib/jump-drafts";
import { logicalDateFromDate, zonedDateTimeToUtc } from "../src/lib/jump-schedule";
import { prisma } from "../src/lib/prisma";
import { BROADCAST_TIMEZONE, createBroadcastFixture, localDateDaysFromToday, type BroadcastFixture } from "./helpers/broadcast-fixture";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
const baseAt = (days: number, timeMinutes = 600) =>
  zonedDateTimeToUtc(logicalDateFromDate(localDateDaysFromToday(days, now)), timeMinutes, BROADCAST_TIMEZONE).toISOString();
const snooze = (jumpId: string, until: Date) => prisma.jump.update({ where: { id: jumpId }, data: { scheduledAt: until, snoozedUntil: until } });
const draftsOf = (jumpId: string) => prisma.jumpDraft.findMany({ where: { jumpId }, orderBy: { family: "asc" } });

describe.sequential("drafts follow the same occurrence through reconciliation", () => {
  let fixture: BroadcastFixture;
  let mixId: string;
  let jumpId: string;
  const pendingJump = () => prisma.jump.findFirstOrThrow({ where: { workspaceId: fixture.workspaceId, mixId, status: "PENDING" } });
  const body = "Hi {{First Name}}, I have your estimate ready whenever you are.";

  beforeAll(async () => {
    fixture = await createBroadcastFixture("draft-continuity");
    mixId = await fixture.addBroadcast("Draft Broadcast", -3);
    await reconcileJumps({ workspaceId: fixture.workspaceId, mixId });
    jumpId = (await pendingJump()).id;
    const saved = await saveJumpDraft({ workspaceId: fixture.workspaceId, jumpId, family: "TEXT", body, revision: null });
    expect(saved.ok).toBe(true);
    await snooze(jumpId, new Date(now.getTime() + 2 * DAY));
  });
  afterAll(() => fixture.cleanup());

  it("is untouched by repeated passes and by a contact edit that refreshes the rendered message", async () => {
    const before = await draftsOf(jumpId);
    const first = await reconcileJumps({ workspaceId: fixture.workspaceId });
    const second = await reconcileJumps({ workspaceId: fixture.workspaceId });
    expect(first.updated + second.updated).toBe(0);
    await prisma.contact.update({ where: { id: fixture.contactId }, data: { firstName: "Alexandra", displayName: "Alexandra" } });
    const refreshed = await reconcileJumps({ workspaceId: fixture.workspaceId });
    expect(refreshed.updated).toBe(1);
    const jump = await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } });
    expect(jump.renderedSnapshot).toMatchObject({ body: "Hi Alexandra" });
    expect(await draftsOf(jumpId)).toEqual(before);
  });

  it("stays on the row when a paused mix resumes", async () => {
    await prisma.jump.update({ where: { id: jumpId }, data: { status: "CANCELED", completionMethod: "mix_paused", completedAt: new Date() } });
    const result = await reconcileJumps({ workspaceId: fixture.workspaceId });
    expect(result.updated).toBe(1);
    expect((await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } })).status).toBe("PENDING");
    expect(await draftsOf(jumpId)).toMatchObject([{ family: "TEXT", body, revision: 1 }]);
  });

  it("moves with the snooze onto the row regenerated after a time-only edit, leaving the replaced row empty", async () => {
    const before = await pendingJump();
    const until = new Date(now.getTime() + 9 * DAY);
    await snooze(before.id, until);
    await prisma.mixBroadcastSchedule.update({ where: { mixId }, data: { timeMinutes: 690 } });
    const result = await reconcileJumps({ workspaceId: fixture.workspaceId, mixId });
    expect(result.created).toBe(1);
    expect(result.canceled).toBe(1);
    const after = await pendingJump();
    expect(after.id).not.toBe(before.id);
    expect(after.snoozedUntil?.toISOString()).toBe(until.toISOString());
    expect(after.baseScheduledAt?.toISOString()).toBe(baseAt(-3, 690));
    expect(await draftsOf(after.id)).toMatchObject([{ family: "TEXT", body, revision: 1, workspaceId: fixture.workspaceId }]);
    expect(await draftsOf(before.id)).toEqual([]);
    expect((await prisma.jump.findUniqueOrThrow({ where: { id: before.id } })).status).toBe("CANCELED");
    jumpId = after.id;
  });

  it("carries a draft without a snooze the same way", async () => {
    await prisma.jump.update({ where: { id: jumpId }, data: { snoozedUntil: null, scheduledAt: new Date(baseAt(-3, 690)) } });
    await prisma.mixBroadcastSchedule.update({ where: { mixId }, data: { timeMinutes: 720 } });
    const result = await reconcileJumps({ workspaceId: fixture.workspaceId, mixId });
    expect(result.created).toBe(1);
    const after = await pendingJump();
    expect(after.id).not.toBe(jumpId);
    expect(after.snoozedUntil).toBeNull();
    expect(await draftsOf(after.id)).toMatchObject([{ family: "TEXT", body, revision: 1 }]);
    expect(await draftsOf(jumpId)).toEqual([]);
    jumpId = after.id;
  });

  it("does not transfer a draft to a different occurrence when the broadcast moves", async () => {
    await prisma.mixBroadcastSchedule.update({ where: { mixId }, data: { localDate: localDateDaysFromToday(5, now) } });
    const result = await reconcileJumps({ workspaceId: fixture.workspaceId, mixId });
    expect(result.created).toBe(1);
    expect(result.canceled).toBe(1);
    const fresh = await pendingJump();
    expect(fresh.id).not.toBe(jumpId);
    expect(await draftsOf(fresh.id)).toEqual([]);
    // The replaced row keeps the owner's text until retention removes it.
    expect(await draftsOf(jumpId)).toMatchObject([{ family: "TEXT", body, revision: 1 }]);
    expect((await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } })).status).toBe("CANCELED");
  });

  it("never brings a completed occurrence back when a time edit changes its key, and leaves its draft", async () => {
    const fresh = await pendingJump();
    await saveJumpDraft({ workspaceId: fixture.workspaceId, jumpId: fresh.id, family: "TEXT", body: "Completed edit", revision: null });
    await prisma.jump.update({ where: { id: fresh.id }, data: { status: "DONE", completedAt: new Date(), completionMethod: "outcome:completed" } });
    await prisma.mixBroadcastSchedule.update({ where: { mixId }, data: { timeMinutes: 750 } });
    const result = await reconcileJumps({ workspaceId: fixture.workspaceId, mixId });
    expect(result.created).toBe(0);
    expect(await prisma.jump.count({ where: { workspaceId: fixture.workspaceId, mixId, status: "PENDING" } })).toBe(0);
    expect((await prisma.jump.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe("DONE");
    expect(await draftsOf(fresh.id)).toMatchObject([{ body: "Completed edit" }]);
  });
});
