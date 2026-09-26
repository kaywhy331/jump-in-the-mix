import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The hook runs after the pass has read the existing rows and before its stale pass, standing in
// for a contact-scoped pass or an owner action that lands in that gap and creates a follow-up.
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

describe.sequential("the stale pass leaves rows created after the pass started", () => {
  let fixture: BroadcastFixture;
  let mixId: string;

  beforeAll(async () => {
    fixture = await createBroadcastFixture("fresh-rows");
    mixId = await fixture.addBroadcast("Fresh Broadcast", -3);
    await reconcileJumps({ workspaceId: fixture.workspaceId });
  });

  afterAll(async () => {
    race.afterExistingRead = null;
    await fixture.cleanup();
  });

  it("a PENDING row created while the pass runs survives it, and the next pass judges it", async () => {
    const desired = await prisma.jump.findFirstOrThrow({ where: { workspaceId: fixture.workspaceId, mixId, status: "PENDING" } });
    const freshId = `fresh-${randomUUID()}`;
    race.afterExistingRead = async () => {
      await prisma.jump.create({ data: {
        id: freshId, workspaceId: fixture.workspaceId, contactId: fixture.contactId, mixId, mixStepId: desired.mixStepId, stepVersionId: desired.stepVersionId,
        scheduledAt: desired.scheduledAt, baseScheduledAt: desired.scheduledAt, status: "PENDING", reason: "Created by a concurrent pass", uniquenessKey: freshId,
        templateSnapshot: {}, renderedSnapshot: {}
      } });
    };
    const concurrent = await reconcileJumps({ workspaceId: fixture.workspaceId });
    expect(race.afterExistingRead).toBeNull();
    expect(concurrent.canceled).toBe(0);
    expect((await prisma.jump.findUniqueOrThrow({ where: { id: freshId } })).status).toBe("PENDING");

    // Nothing desires the row, so the next pass, which started after it existed, cancels it as stale.
    const next = await reconcileJumps({ workspaceId: fixture.workspaceId });
    expect(next.canceled).toBe(1);
    expect(await prisma.jump.findUniqueOrThrow({ where: { id: freshId } })).toMatchObject({ status: "CANCELED", completionMethod: "reconciled" });
  });
});
