import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runDataRetention } from "../src/lib/data-retention";
import { reconcileJumps } from "../src/lib/jump-engine";
import { prisma } from "../src/lib/prisma";
import { Prisma } from "../src/generated/prisma/client";
import { createBroadcastFixture, type BroadcastFixture } from "./helpers/broadcast-fixture";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const DAY = 86_400_000;

describe.skipIf(!local).sequential("follow-up draft retention", () => {
  let fixture: BroadcastFixture;
  let state: Awaited<ReturnType<typeof prisma.dataRetentionState.findUnique>>;
  const now = new Date();
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const rows: Record<string, string> = {};

  beforeAll(async () => {
    fixture = await createBroadcastFixture("draft-retention");
    state = await prisma.dataRetentionState.findUnique({ where: { id: "primary" } });
    for (const name of ["oldDone", "recentDone", "heldPause", "heldArchive", "staleCancel", "mergedCancel", "pending"]) {
      const mixId = await fixture.addBroadcast(`Retention ${name}`, -1);
      await reconcileJumps({ workspaceId: fixture.workspaceId, mixId });
      const jump = await prisma.jump.findFirstOrThrow({ where: { workspaceId: fixture.workspaceId, mixId, status: "PENDING" } });
      await prisma.jumpDraft.create({ data: { jumpId: jump.id, family: "TEXT", workspaceId: fixture.workspaceId, stepVersionId: jump.stepVersionId, body: `Draft ${name}` } });
      rows[name] = jump.id;
    }
    const set = (name: string, data: Prisma.JumpUpdateInput) => prisma.jump.update({ where: { id: rows[name] }, data });
    await set("oldDone", { status: "DONE", completedAt: ago(31), completionMethod: "outcome:completed" });
    await set("recentDone", { status: "DONE", completedAt: ago(10), completionMethod: "outcome:completed" });
    await set("heldPause", { status: "CANCELED", completedAt: null, completionMethod: "mix_paused" });
    await set("heldArchive", { status: "CANCELED", completedAt: null, completionMethod: "contact_archived" });
    await set("staleCancel", { status: "CANCELED", completedAt: null, completionMethod: "reconciled" });
    await set("mergedCancel", { status: "CANCELED", completedAt: null, completionMethod: "contact_merged" });
    // Prisma's @updatedAt stamps now; the held and cancelled rows have to look old for the cutoff.
    await prisma.$executeRaw`UPDATE "Jump" SET "updatedAt" = ${ago(40)} WHERE id IN (${Prisma.join([rows.heldPause, rows.heldArchive, rows.staleCancel, rows.mergedCancel])})`;
  });
  afterAll(async () => {
    await prisma.dataRetentionState.deleteMany();
    if (state) await prisma.dataRetentionState.create({ data: { ...state, counts: state.counts ?? Prisma.DbNull } });
    await fixture.cleanup();
  });

  it("removes drafts a month after a terminal state and keeps drafts on held and open follow-ups", async () => {
    const counts = await runDataRetention(now);
    expect(counts.followUpDrafts).toBe(3);
    const remaining = (await prisma.jumpDraft.findMany({ where: { workspaceId: fixture.workspaceId }, select: { jumpId: true } })).map((row) => row.jumpId).sort();
    expect(remaining).toEqual([rows.recentDone, rows.heldPause, rows.heldArchive, rows.pending].sort());
    expect((await runDataRetention(now)).followUpDrafts).toBe(0);
  });
});
