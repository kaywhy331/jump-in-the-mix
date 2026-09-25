import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { reconcileJumps } from "../src/lib/jump-engine";
import { prisma } from "../src/lib/prisma";
import { createBroadcastFixture, type BroadcastFixture } from "./helpers/broadcast-fixture";

const mocks = vi.hoisted(() => ({ session: vi.fn(), requireWorkspace: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentSession: mocks.session, requireWorkspace: mocks.requireWorkspace }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: null, userAgent: "Outcome retry test" }) }));
import { POST as postOutcome } from "../src/app/api/jumps/[jumpId]/outcome/route";

const post = (jumpId: string, body: unknown) =>
  postOutcome(new Request(`https://example.test/api/jumps/${jumpId}/outcome`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ jumpId }) });
const outcomeCount = (jumpId: string) => prisma.contactActivity.count({ where: { jumpId, kind: "JUMP_OUTCOME" } });

// A retry after a lost answer must find its own outcome again, and a retry that lost track of its
// request id must learn what the follow-up is now instead of a bare "no longer pending".
describe.sequential("follow-up outcome retries", () => {
  let fixture: BroadcastFixture;
  let workspaceId: string;

  const newPendingJump = async () => {
    const mixId = await fixture.addBroadcast(`Retry ${randomUUID().slice(0, 8)}`, -1);
    await reconcileJumps({ workspaceId, mixId });
    return prisma.jump.findFirstOrThrow({ where: { workspaceId, mixId, status: "PENDING" } });
  };

  beforeAll(async () => {
    fixture = await createBroadcastFixture("outcome-retry");
    workspaceId = fixture.workspaceId;
    mocks.session.mockResolvedValue({ user: { id: fixture.userId, memberships: [{ workspaceId }] }, impersonation: null });
    mocks.requireWorkspace.mockResolvedValue({ user: { id: fixture.userId, name: "Retry owner", email: "retry@example.test", createdAt: new Date(), updatedAt: new Date() }, workspace: { id: workspaceId }, impersonation: null });
  });
  afterAll(() => fixture.cleanup());

  it("replays the stored outcome for the same request id and records it once", async () => {
    const jump = await newPendingJump();
    const requestId = randomUUID();
    const first = await post(jump.id, { outcome: "COMPLETED", requestId, note: "Left the estimate at the door" });
    expect(first.status).toBe(200);
    const stored = await first.json() as { status: string; activityId: string; duplicate?: boolean };
    expect(stored).toMatchObject({ status: "DONE", nextCommitmentAt: null, jumpDateId: null });
    expect(stored.duplicate).toBeUndefined();

    const again = await post(jump.id, { outcome: "COMPLETED", requestId, note: "Left the estimate at the door" });
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ...stored, duplicate: true });
    expect(await outcomeCount(jump.id)).toBe(1);
    expect((await prisma.jump.findUniqueOrThrow({ where: { id: jump.id } })).status).toBe("DONE");
  });

  it("refuses a different request id after completion and names the follow-up's current status", async () => {
    const jump = await newPendingJump();
    expect((await post(jump.id, { outcome: "COMPLETED", requestId: randomUUID() })).status).toBe(200);
    const retry = await post(jump.id, { outcome: "CONNECTED", requestId: randomUUID(), note: "Typed after the first answer was lost" });
    expect(retry.status).toBe(409);
    expect(await retry.json()).toEqual({ error: "This follow-up is no longer pending.", status: "DONE" });
    expect(await outcomeCount(jump.id)).toBe(1);
    // Nothing from the refused request reached the record.
    expect(await prisma.contactActivity.count({ where: { jumpId: jump.id, summary: { contains: "Typed after" } } })).toBe(0);
  });

  it("names a skipped or canceled follow-up in the refusal too", async () => {
    const skipped = await newPendingJump();
    expect((await post(skipped.id, { outcome: "SKIPPED", requestId: randomUUID() })).status).toBe(200);
    const afterSkip = await post(skipped.id, { outcome: "COMPLETED", requestId: randomUUID() });
    expect(afterSkip.status).toBe(409);
    expect(await afterSkip.json()).toEqual({ error: "This follow-up is no longer pending.", status: "SKIPPED" });

    const canceled = await newPendingJump();
    await prisma.jump.update({ where: { id: canceled.id }, data: { status: "CANCELED" } });
    const afterCancel = await post(canceled.id, { outcome: "COMPLETED", requestId: randomUUID() });
    expect(afterCancel.status).toBe(409);
    expect(await afterCancel.json()).toEqual({ error: "This follow-up is no longer active.", status: "CANCELED" });
    expect(await outcomeCount(canceled.id)).toBe(0);
  });

  it("reports the status after a race, not the one read before it", async () => {
    const jump = await newPendingJump();
    const responses = await Promise.all([randomUUID(), randomUUID()].map((requestId) => post(jump.id, { outcome: "COMPLETED", requestId })));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const refused = responses.find((response) => response.status === 409)!;
    expect(await refused.json()).toEqual({ error: "This follow-up is no longer pending.", status: "DONE" });
    expect(await outcomeCount(jump.id)).toBe(1);
  });
});
