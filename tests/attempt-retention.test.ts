import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "../src/generated/prisma/client";
import { runDataRetention } from "../src/lib/data-retention";
import { encryptIntegrationCredentials } from "../src/lib/integration-crypto";
import { reconcileJumps } from "../src/lib/jump-engine";
import { prisma } from "../src/lib/prisma";
import { createBroadcastFixture, type BroadcastFixture } from "./helpers/broadcast-fixture";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const DAY = 86_400_000;

describe.skipIf(!local).sequential("follow-up attempt recipient minimization", () => {
  let fixture: BroadcastFixture;
  let state: Awaited<ReturnType<typeof prisma.dataRetentionState.findUnique>>;
  const now = new Date();
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const ids = { old: randomUUID(), oldButRecorded: randomUUID(), recent: randomUUID() };

  beforeAll(async () => {
    fixture = await createBroadcastFixture("attempt-retention");
    state = await prisma.dataRetentionState.findUnique({ where: { id: "primary" } });
    const mixId = await fixture.addBroadcast("Retention attempts", -1);
    await reconcileJumps({ workspaceId: fixture.workspaceId, mixId });
    const jump = await prisma.jump.findFirstOrThrow({ where: { workspaceId: fixture.workspaceId, mixId } });
    const base = { workspaceId: fixture.workspaceId, jumpId: jump.id, contactId: fixture.contactId, channel: "SMS" as const, family: "TEXT" as const, recipientHash: "hash", stepVersionId: jump.stepVersionId, contextVersions: {}, payloadHash: "payload", body: "Hi" };
    await prisma.jumpAttempt.createMany({ data: [
      { ...base, id: ids.old, recipientCiphertext: encryptIntegrationCredentials("+15550100001"), openedAt: ago(401), createdAt: ago(401) },
      { ...base, id: ids.oldButRecorded, recipientCiphertext: encryptIntegrationCredentials("+15550100002"), openedAt: ago(401), createdAt: ago(401), recordedAt: ago(10) },
      { ...base, id: ids.recent, recipientCiphertext: encryptIntegrationCredentials("+15550100003"), openedAt: ago(5), createdAt: ago(5) }
    ] });
  });
  afterAll(async () => {
    await prisma.dataRetentionState.deleteMany();
    if (state) await prisma.dataRetentionState.create({ data: { ...state, counts: state.counts ?? Prisma.DbNull } });
    await fixture.cleanup();
  });

  it("clears only the recipient of attempts older than the window and keeps the hash and content", async () => {
    expect((await runDataRetention(now)).attemptRecipients).toBe(1);
    const old = await prisma.jumpAttempt.findUniqueOrThrow({ where: { id: ids.old } });
    expect(old).toMatchObject({ recipientCiphertext: "", recipientRetiredAt: now, recipientHash: "hash", body: "Hi" });
    for (const id of [ids.oldButRecorded, ids.recent]) {
      const row = await prisma.jumpAttempt.findUniqueOrThrow({ where: { id } });
      expect(row.recipientRetiredAt).toBeNull();
      expect(row.recipientCiphertext).not.toBe("");
    }
    expect((await runDataRetention(now)).attemptRecipients).toBe(0);
  });
});
