import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { decryptIntegrationCredentials } from "../src/lib/integration-crypto";
import { attachAttemptOutcome, attemptPayloadHash, parseAttemptPayload, recipientHash, recordJumpAttempt, type AttemptPayload } from "../src/lib/jump-attempts";
import { reconcileJumps } from "../src/lib/jump-engine";
import { prisma } from "../src/lib/prisma";
import { createBroadcastFixture, type BroadcastFixture } from "./helpers/broadcast-fixture";

const mocks = vi.hoisted(() => ({ session: vi.fn(), requireWorkspace: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentSession: mocks.session, requireWorkspace: mocks.requireWorkspace }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: null, userAgent: "Attempt test" }) }));
import { POST as postAttempt } from "../src/app/api/jumps/[jumpId]/attempts/route";
import { POST as postAction } from "../src/app/api/jumps/[jumpId]/actions/route";
import { POST as postOutcome } from "../src/app/api/jumps/[jumpId]/outcome/route";
import { GET as exportAccount } from "../src/app/api/account/export/route";

const RECIPIENT = "+1 (555) 010-0200";
type RouteHandler = (request: Request, context: { params: Promise<{ jumpId: string }> }) => Promise<Response>;
const post = (handler: RouteHandler, jumpId: string, body: unknown) =>
  handler(new Request(`https://example.test/api/jumps/${jumpId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ jumpId }) });

describe.sequential("follow-up handoff attempts", () => {
  let fixture: BroadcastFixture;
  let workspaceId: string;
  let jumpId: string;
  let stepVersionId: string;

  const payload = (overrides: Partial<AttemptPayload> = {}): AttemptPayload => ({
    id: randomUUID(),
    contactId: fixture.contactId,
    channel: "SMS",
    family: "TEXT",
    recipient: RECIPIENT,
    subject: null,
    body: "Hi Alex, your estimate is ready.",
    script: null,
    draftRevision: null,
    stepVersionId,
    contextVersions: { contactVersion: "2026-09-13T00:00:00.000Z", businessProfileVersion: "2026-09-12T00:00:00.000Z" },
    openedAt: new Date().toISOString(),
    ...overrides
  });
  const newPendingJump = async () => {
    const mixId = await fixture.addBroadcast(`Attempt ${randomUUID().slice(0, 8)}`, -1);
    await reconcileJumps({ workspaceId, mixId });
    return prisma.jump.findFirstOrThrow({ where: { workspaceId, mixId, status: "PENDING" } });
  };

  beforeAll(async () => {
    fixture = await createBroadcastFixture("attempt");
    workspaceId = fixture.workspaceId;
    await prisma.contactPhone.create({ data: { contactId: fixture.contactId, phone: RECIPIENT, normalized: "+15550100200", isPrimary: true } });
    const jump = await newPendingJump();
    jumpId = jump.id;
    stepVersionId = jump.stepVersionId;
    mocks.session.mockResolvedValue({ user: { id: fixture.userId, memberships: [{ workspaceId }] }, impersonation: null });
    mocks.requireWorkspace.mockResolvedValue({ user: { id: fixture.userId, name: "Attempt owner", email: "attempt@example.test", createdAt: new Date(), updatedAt: new Date() }, workspace: { id: workspaceId }, impersonation: null });
  });
  afterAll(() => fixture.cleanup());

  it("records the exact content once, with the recipient encrypted as written beside a keyed hash", async () => {
    const input = payload();
    const result = await recordJumpAttempt({ workspaceId, jumpId, payload: input });
    expect(result).toEqual({ ok: true, attemptId: input.id, duplicate: false });
    const row = await prisma.jumpAttempt.findUniqueOrThrow({ where: { id: input.id } });
    expect(row).toMatchObject({ workspaceId, jumpId, contactId: fixture.contactId, channel: "SMS", family: "TEXT", body: input.body, subject: null, script: null, draftRevision: null, stepVersionId, outcomeActivityId: null, recordedAt: null, recipientRetiredAt: null });
    expect(row.openedAt.toISOString()).toBe(input.openedAt);
    expect(decryptIntegrationCredentials<string>(row.recipientCiphertext)).toBe(RECIPIENT);
    expect(row.recipientHash).toBe(recipientHash("SMS", "+15550100200"));
    expect(row.payloadHash).toBe(attemptPayloadHash(jumpId, input));
    expect(row.recipientCiphertext).not.toContain("0200");
  });

  it("acknowledges an identical retry and refuses a changed one without touching the row", async () => {
    const input = payload();
    await recordJumpAttempt({ workspaceId, jumpId, payload: input });
    const before = await prisma.jumpAttempt.findUniqueOrThrow({ where: { id: input.id } });
    expect(await recordJumpAttempt({ workspaceId, jumpId, payload: { ...input } })).toEqual({ ok: true, attemptId: input.id, duplicate: true });
    expect(await recordJumpAttempt({ workspaceId, jumpId, payload: { ...input, body: "Hi Alex, changed after the fact." } })).toMatchObject({ ok: false, reason: "mismatch" });
    expect(await recordJumpAttempt({ workspaceId, jumpId, payload: { ...input, contextVersions: { ...input.contextVersions, contactVersion: "later" } } })).toMatchObject({ ok: false, reason: "mismatch" });
    expect(await prisma.jumpAttempt.findUniqueOrThrow({ where: { id: input.id } })).toEqual(before);
  });

  it("produces one row and two acknowledgments for concurrent creation with one id", async () => {
    const input = payload();
    const results = await Promise.all([1, 2, 3].map(() => recordJumpAttempt({ workspaceId, jumpId, payload: input })));
    expect(results.every((result) => result.ok)).toBe(true);
    expect(await prisma.jumpAttempt.count({ where: { id: input.id } })).toBe(1);
    expect(results.filter((result) => result.ok && !result.duplicate)).toHaveLength(1);
  });

  it("refuses a different person, an unsaved recipient, a foreign workspace and malformed payloads", async () => {
    expect(await recordJumpAttempt({ workspaceId, jumpId, payload: payload({ contactId: "someone-else" }) })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await recordJumpAttempt({ workspaceId, jumpId, payload: payload({ recipient: "+1 555 010 9999" }) })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await recordJumpAttempt({ workspaceId: "other", jumpId, payload: payload() })).toMatchObject({ ok: false, reason: "unavailable" });
    expect(() => parseAttemptPayload(payload({ id: "not-a-uuid" }))).toThrow(/id/);
    expect(() => parseAttemptPayload(payload({ family: "EMAIL" }))).toThrow(/message type/);
    expect(() => parseAttemptPayload(payload({ body: "x".repeat(20_001) }))).toThrow(/too long/);
    expect(() => parseAttemptPayload(payload({ contextVersions: { contactVersion: "c" } as AttemptPayload["contextVersions"] }))).toThrow(/context/);
    expect(() => parseAttemptPayload(payload({ openedAt: "yesterday" }))).toThrow(/time/);
    expect(parseAttemptPayload({ ...payload(), id: "8A1F0E9C-1B2D-4C3E-9F8A-7B6C5D4E3F2A" }).id).toBe("8a1f0e9c-1b2d-4c3e-9f8a-7b6c5d4e3f2a");
  });

  it("serves the create-once rule through the route", async () => {
    const input = payload();
    const first = await post(postAttempt, jumpId, input);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ attemptId: input.id, duplicate: false });
    const again = await post(postAttempt, jumpId, input);
    expect(await again.json()).toEqual({ attemptId: input.id, duplicate: true });
    const changed = await post(postAttempt, jumpId, { ...input, subject: "added" });
    expect(changed.status).toBe(409);
    expect(await changed.json()).toMatchObject({ reason: "mismatch" });
    expect((await post(postAttempt, jumpId, { ...input, id: "nope" })).status).toBe(400);
    expect((await post(postAttempt, "missing-follow-up", payload())).status).toBe(404);
    mocks.session.mockResolvedValueOnce({ user: { id: fixture.userId, memberships: [{ workspaceId }] }, impersonation: { id: "support" } });
    expect((await post(postAttempt, jumpId, payload())).status).toBe(403);
    const action = await post(postAction, jumpId, { action: "COMPOSED", attemptId: input.id });
    expect(action.status).toBe(204);
    expect(await prisma.jumpActionEvent.findFirst({ where: { jumpId, attemptId: input.id }, select: { action: true } })).toEqual({ action: "COMPOSED" });
  });

  it("lets an outcome attach only its reference and time to the attempt, once", async () => {
    const input = payload();
    await recordJumpAttempt({ workspaceId, jumpId, payload: input });
    const before = await prisma.jumpAttempt.findUniqueOrThrow({ where: { id: input.id } });
    const response = await post(postOutcome, jumpId, { outcome: "COMPLETED", requestId: randomUUID(), attemptId: input.id });
    expect(response.status).toBe(200);
    const body = await response.json() as { activityId: string; attempt: { id: string; evidence: string } };
    expect(body.attempt).toEqual({ id: input.id, evidence: "attempt" });
    const after = await prisma.jumpAttempt.findUniqueOrThrow({ where: { id: input.id } });
    expect(after).toEqual({ ...before, outcomeActivityId: body.activityId, recordedAt: after.recordedAt });
    expect(after.recordedAt).toBeInstanceOf(Date);
    expect(await prisma.contactActivity.findUniqueOrThrow({ where: { id: body.activityId } })).toMatchObject({ metadata: expect.objectContaining({ attemptId: input.id, preparationEvidence: "attempt" }) });

    await post(postOutcome, jumpId, { outcome: "REOPENED", requestId: randomUUID() });
    const second = await post(postOutcome, jumpId, { outcome: "COMPLETED", requestId: randomUUID(), attemptId: input.id });
    expect(second.status).toBe(200);
    expect((await prisma.jumpAttempt.findUniqueOrThrow({ where: { id: input.id } })).outcomeActivityId).toBe(body.activityId);
    expect(await attachAttemptOutcome(prisma, { workspaceId, jumpId, attemptId: input.id, outcomeActivityId: "later", recordedAt: new Date() })).toBe(false);
  });

  it("creates an unacknowledged attempt from the outcome, and marks a mismatch or a missing one without rewriting anything", async () => {
    const jump = await newPendingJump();
    const fresh = payload({ stepVersionId: jump.stepVersionId });
    const created = await post(postOutcome, jump.id, { outcome: "NOT_SENT", requestId: randomUUID(), attemptId: fresh.id, attempt: fresh });
    expect(await created.json()).toMatchObject({ attempt: { id: fresh.id, evidence: "attempt" } });
    const row = await prisma.jumpAttempt.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(row.outcomeActivityId).not.toBeNull();

    const stored = payload({ stepVersionId: jump.stepVersionId });
    await recordJumpAttempt({ workspaceId, jumpId: jump.id, payload: stored });
    const before = await prisma.jumpAttempt.findUniqueOrThrow({ where: { id: stored.id } });
    const mismatch = await post(postOutcome, jump.id, { outcome: "NOT_SENT", requestId: randomUUID(), attemptId: stored.id, attempt: { ...stored, body: "Different text on this device" } });
    expect(mismatch.status).toBe(200);
    const mismatchBody = await mismatch.json() as { activityId: string; attempt: { evidence: string } };
    expect(mismatchBody.attempt.evidence).toBe("mismatch");
    expect(await prisma.jumpAttempt.findUniqueOrThrow({ where: { id: stored.id } })).toEqual(before);
    expect(await prisma.contactActivity.findUniqueOrThrow({ where: { id: mismatchBody.activityId } })).toMatchObject({ metadata: expect.objectContaining({ attemptId: stored.id, preparationEvidence: "mismatch" }) });

    const unknown = await post(postOutcome, jump.id, { outcome: "COMPLETED", requestId: randomUUID(), attemptId: randomUUID() });
    expect(await unknown.json()).toMatchObject({ attempt: { evidence: "unavailable" } });
    expect(await prisma.jumpAttempt.count({ where: { jumpId: jump.id } })).toBe(2);
  });

  it("exports attempts with the recipient decrypted for the owner", async () => {
    const response = await exportAccount(new Request("https://example.test/api/account/export"));
    const document = await response.json() as { followUpAttempts: Array<Record<string, unknown>> };
    expect(document.followUpAttempts.length).toBeGreaterThan(0);
    for (const attempt of document.followUpAttempts) {
      expect(attempt.recipient).toBe(RECIPIENT);
      expect(attempt).not.toHaveProperty("recipientCiphertext");
    }
  });
});
