import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { resolveNextActions, withoutSettledActionVersions, type NextActionCandidate } from "@/lib/next-action";
import { prisma } from "@/lib/prisma";
import { reconcileJumps } from "@/lib/jump-engine";
import { createBroadcastFixture, type BroadcastFixture } from "./helpers/broadcast-fixture";

const session = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getCurrentSession: session }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: null, userAgent: "Settlement version fixture" }) }));
import { POST } from "@/app/api/jumps/[jumpId]/outcome/route";

let fixture: BroadcastFixture;
beforeAll(async () => {
  fixture = await createBroadcastFixture("settlement-version");
  session.mockResolvedValue({ user: { id: fixture.userId, memberships: [{ workspaceId: fixture.workspaceId }] }, impersonation: null });
});
afterAll(() => fixture.cleanup());
async function settledVersion(status: string) {
  const mixId = await fixture.addBroadcast(`Version ${randomUUID()}`, -1);
  await reconcileJumps({ workspaceId: fixture.workspaceId, mixId });
  const jump = await prisma.jump.findFirstOrThrow({ where: { workspaceId: fixture.workspaceId, mixId, status: "PENDING" } });
  const requestId = randomUUID();
  const post = (outcome: string, id = requestId) => POST(new Request(`https://example.test/api/jumps/${jump.id}/outcome`, { method: "POST", body: JSON.stringify({ outcome, requestId: id }) }), { params: Promise.resolve({ jumpId: jump.id }) });
  const outcome = status === "SKIPPED" ? "SKIPPED" : "COMPLETED";
  const response = await post(outcome);
  expect(response.status).toBe(200);
  const stored = await prisma.jump.findUniqueOrThrow({ where: { id: jump.id } });
  // Q6: this assertion fails on 1804bd0 for H01 even when the R1 projection helper is supplied.
  expect(response.headers.get("X-JITM-Jump-Updated-At")).toBe(stored.updatedAt.toISOString());
  expect((await post(outcome)).headers.get("X-JITM-Jump-Updated-At")).toBe(stored.updatedAt.toISOString());
  const conflict = await post(outcome, randomUUID());
  expect(conflict.status).toBe(409);
  expect(conflict.headers.get("X-JITM-Jump-Updated-At")).toBe(stored.updatedAt.toISOString());
  return { post, stored };
}

const version = "2026-11-01T12:00:00.000Z";
const candidate: NextActionCandidate = { id: "workspace:jump:one", jumpId: "one", contactId: "contact", contactName: "Fixture", kind: "follow-up", title: "Check in", detail: "Prepared follow-up", href: "/jumps?jump=one", action: "Review message", dueAt: version, updatedAt: version };
const projection = (items: NextActionCandidate[], observedAt = version) => resolveNextActions(items, { now: new Date(observedAt), timeZone: "UTC" });

describe("H01 versioned settlement", () => {
  for (const status of ["DONE", "SKIPPED"]) it(`${status}: later reads do not reopen an equal or older obligation version`, async () => {
    await settledVersion(status);
    const receipts = new Map([["one", version]]);
    for (const updatedAt of [version, "2026-11-01T11:59:00.000Z"]) {
      const result = withoutSettledActionVersions(projection([{ ...candidate, updatedAt }], "2026-11-01T12:05:00.000Z"), receipts);
      expect(result.items).toEqual([]);
      expect(result.attentionCount).toBe(0);
    }
  });
  it("a newer server version reopens only its obligation and an older replay stays settled", async () => {
    const { post, stored } = await settledVersion("DONE");
    const undo = await post("REOPENED", randomUUID());
    expect(Date.parse(undo.headers.get("X-JITM-Jump-Updated-At")!)).toBeGreaterThan(stored.updatedAt.getTime());
    const receipts = new Map([["one", version]]);
    const newer = { ...candidate, updatedAt: "2026-11-01T12:01:00.000Z" };
    expect(withoutSettledActionVersions(projection([newer], newer.updatedAt), receipts).items).toHaveLength(1);
    expect(withoutSettledActionVersions(projection([candidate]), receipts).items).toHaveLength(0);
    expect(withoutSettledActionVersions(projection([candidate, { ...candidate, id: "other", jumpId: "other" }]), receipts).items.map(item => item.id)).toEqual(["other"]);
  });
  it("a real Undo receipt allows the pending obligation again", async () => {
    const { post, stored } = await settledVersion("SKIPPED");
    const undo = await post("REOPENED", randomUUID());
    expect(Date.parse(undo.headers.get("X-JITM-Jump-Updated-At")!)).toBeGreaterThan(stored.updatedAt.getTime());
    const receipts = new Map([["one", version]]);
    expect(withoutSettledActionVersions(projection([candidate]), receipts).items).toHaveLength(0);
    receipts.delete("one");
    expect(withoutSettledActionVersions(projection([candidate]), receipts).items).toHaveLength(1);
  });
  it("a snapshot captured before settlement cannot reopen even with a later item version", () => {
    const receipts = new Map([["one", version]]);
    const newer = { ...candidate, updatedAt: "2026-11-01T12:01:00.000Z" };
    expect(withoutSettledActionVersions(projection([newer], version), receipts).items).toHaveLength(0);
  });
  it("an unversioned legacy settlement stays closed until a real Undo", () => {
    const receipts = new Map<string, string | null>([["one", null]]);
    expect(withoutSettledActionVersions(projection([candidate]), receipts).items).toHaveLength(0);
    receipts.delete("one");
    expect(withoutSettledActionVersions(projection([candidate]), receipts).items).toHaveLength(1);
  });
});
