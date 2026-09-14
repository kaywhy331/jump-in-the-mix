import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Deterministic races: the hook runs after the reconciler has read the existing rows and before it
// writes, standing in for an owner action or another worker that lands in that gap. A client
// extension sees every access path, including any future transaction client.
const race = vi.hoisted(() => ({ afterExistingRead: null as null | (() => Promise<void>) }));

vi.mock("@/lib/prisma", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/prisma")>();
  const prisma = actual.prisma.$extends({
    query: {
      jump: {
        async findMany({ args, query }) {
          const rows = await query(args);
          const hook = race.afterExistingRead;
          if (hook && args.where && "uniquenessKey" in args.where) {
            race.afterExistingRead = null;
            await hook();
          }
          return rows;
        }
      }
    }
  });
  return { ...actual, prisma };
});

import { reconcileJumps } from "../src/lib/jump-engine";
import { prisma } from "../src/lib/prisma";
import { createBroadcastFixture, type BroadcastFixture } from "./helpers/broadcast-fixture";

const DAY = 24 * 60 * 60 * 1000;

describe.sequential("reconciliation never overwrites what the owner did in the meantime", () => {
  let fixture: BroadcastFixture;
  let jumpId: string;
  const now = new Date();

  beforeAll(async () => {
    fixture = await createBroadcastFixture("race");
    await fixture.addBroadcast("Race Broadcast", -3);
    await reconcileJumps({ workspaceId: fixture.workspaceId });
    jumpId = (await prisma.jump.findFirstOrThrow({ where: { workspaceId: fixture.workspaceId, status: "PENDING" } })).id;
  });

  afterAll(async () => {
    race.afterExistingRead = null;
    await fixture.cleanup();
  });

  it("a snooze recorded after the read wins, and the pending refresh lands on the next pass", async () => {
    const until = new Date(now.getTime() + 2 * DAY);
    await prisma.contact.update({ where: { id: fixture.contactId }, data: { firstName: "Alexandra", displayName: "Alexandra" } });
    race.afterExistingRead = async () => {
      await prisma.jump.update({ where: { id: jumpId }, data: { scheduledAt: until, snoozedUntil: until } });
    };
    const stale = await reconcileJumps({ workspaceId: fixture.workspaceId });
    const afterStale = await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } });
    expect(race.afterExistingRead).toBeNull();
    expect(stale.updated).toBe(0);
    expect(afterStale.status).toBe("PENDING");
    expect(afterStale.scheduledAt.toISOString()).toBe(until.toISOString());
    expect(afterStale.snoozedUntil?.toISOString()).toBe(until.toISOString());
    expect(afterStale.renderedSnapshot).toMatchObject({ body: "Hi Alex" });

    const fresh = await reconcileJumps({ workspaceId: fixture.workspaceId });
    const afterFresh = await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } });
    expect(fresh.updated).toBe(1);
    expect(afterFresh.status).toBe("PENDING");
    expect(afterFresh.renderedSnapshot).toMatchObject({ body: "Hi Alexandra" });
    expect(afterFresh.scheduledAt.toISOString()).toBe(until.toISOString());
  });

  it("a stop recorded after the read is not resurrected", async () => {
    await prisma.contact.update({ where: { id: fixture.contactId }, data: { firstName: "Lex", displayName: "Lex" } });
    const stoppedAt = new Date();
    race.afterExistingRead = async () => {
      await prisma.jump.update({ where: { id: jumpId }, data: { status: "CANCELED", completedAt: stoppedAt, completionMethod: "mix_stopped_for_contact" } });
    };
    const result = await reconcileJumps({ workspaceId: fixture.workspaceId });
    const after = await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } });
    expect(race.afterExistingRead).toBeNull();
    expect(result.updated).toBe(0);
    expect(after.status).toBe("CANCELED");
    expect(after.completionMethod).toBe("mix_stopped_for_contact");
    expect(after.completedAt?.toISOString()).toBe(stoppedAt.toISOString());
  });

  it("a completion recorded after the read is not reopened", async () => {
    await prisma.jump.update({ where: { id: jumpId }, data: { status: "PENDING", completedAt: null, completionMethod: null } });
    await prisma.contact.update({ where: { id: fixture.contactId }, data: { firstName: "Alexis", displayName: "Alexis" } });
    const doneAt = new Date();
    race.afterExistingRead = async () => {
      await prisma.jump.update({ where: { id: jumpId }, data: { status: "DONE", completedAt: doneAt, completionMethod: "outcome:completed" } });
    };
    const result = await reconcileJumps({ workspaceId: fixture.workspaceId });
    const after = await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } });
    expect(result.updated).toBe(0);
    expect(after.status).toBe("DONE");
    expect(after.completedAt?.toISOString()).toBe(doneAt.toISOString());
  });
});
