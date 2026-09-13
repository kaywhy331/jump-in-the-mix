import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { reconcileJumps } from "../src/lib/jump-engine";
import { discardJumpDraft, readJumpDrafts, saveJumpDraft } from "../src/lib/jump-drafts";
import { prisma } from "../src/lib/prisma";
import { createBroadcastFixture, type BroadcastFixture } from "./helpers/broadcast-fixture";

const mocks = vi.hoisted(() => ({ session: vi.fn(), requireWorkspace: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentSession: mocks.session, requireWorkspace: mocks.requireWorkspace }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: null, userAgent: "Draft test" }) }));
import { DELETE, GET, PUT } from "../src/app/api/jumps/[jumpId]/draft/route";
import { GET as exportAccount } from "../src/app/api/account/export/route";

const call = (method: "PUT" | "DELETE" | "GET", jumpId: string, body?: unknown, query = "") => {
  const request = new Request(`https://example.test/api/jumps/${jumpId}/draft${query}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const context = { params: Promise.resolve({ jumpId }) };
  return method === "PUT" ? PUT(request, context) : method === "DELETE" ? DELETE(request, context) : GET(request, context);
};

describe.sequential("follow-up drafts", () => {
  let fixture: BroadcastFixture;
  let jumpId: string;
  let workspaceId: string;

  beforeAll(async () => {
    fixture = await createBroadcastFixture("draft");
    workspaceId = fixture.workspaceId;
    const mixId = await fixture.addBroadcast("Draft Broadcast", -1);
    await reconcileJumps({ workspaceId, mixId });
    jumpId = (await prisma.jump.findFirstOrThrow({ where: { workspaceId, mixId, status: "PENDING" } })).id;
    mocks.session.mockResolvedValue({ user: { id: fixture.userId, memberships: [{ workspaceId }] }, impersonation: null });
    mocks.requireWorkspace.mockResolvedValue({ user: { id: fixture.userId, name: "Draft owner", email: "draft@example.test", createdAt: new Date(), updatedAt: new Date() }, workspace: { id: workspaceId }, impersonation: null });
  });
  afterAll(() => fixture.cleanup());

  it("creates a draft in token form for the follow-up's own family and keeps only that family's fields", async () => {
    const result = await saveJumpDraft({ workspaceId, jumpId, family: "TEXT", subject: "ignored", body: "Hi {{First Name}}, your estimate is ready.", script: "ignored", revision: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft).toMatchObject({ family: "TEXT", subject: null, script: null, body: "Hi {{First Name}}, your estimate is ready.", revision: 1 });
    const stored = await readJumpDrafts(workspaceId, [jumpId]);
    expect(stored.get(jumpId)?.[0]).toMatchObject({ revision: 1, body: "Hi {{First Name}}, your estimate is ready." });
    expect((await readJumpDrafts("other-workspace", [jumpId])).size).toBe(0);
  });

  it("refuses a second create and a stale revision, returning the current draft instead of merging", async () => {
    const duplicate = await saveJumpDraft({ workspaceId, jumpId, family: "TEXT", body: "Second device", revision: null });
    expect(duplicate).toMatchObject({ ok: false, reason: "conflict", draft: { revision: 1 } });
    const saved = await saveJumpDraft({ workspaceId, jumpId, family: "TEXT", body: "Hi {{First Name}}, your estimate is ready to review.", revision: 1 });
    expect(saved).toMatchObject({ ok: true, draft: { revision: 2 } });
    const stale = await saveJumpDraft({ workspaceId, jumpId, family: "TEXT", body: "Typed on a stale tab", revision: 1 });
    expect(stale).toMatchObject({ ok: false, reason: "conflict", draft: { revision: 2, body: "Hi {{First Name}}, your estimate is ready to review." } });
    expect((await prisma.jumpDraft.findUniqueOrThrow({ where: { jumpId_family: { jumpId, family: "TEXT" } } })).body).toBe("Hi {{First Name}}, your estimate is ready to review.");
  });

  it("refuses the wrong family, another workspace, oversized text and a bad revision", async () => {
    expect(await saveJumpDraft({ workspaceId, jumpId, family: "EMAIL", subject: "S", body: "B", revision: null })).toMatchObject({ ok: false, reason: "unavailable" });
    expect(await saveJumpDraft({ workspaceId: "someone-else", jumpId, family: "TEXT", body: "B", revision: null })).toMatchObject({ ok: false, reason: "unavailable" });
    expect(await saveJumpDraft({ workspaceId, jumpId, family: "TEXT", body: "x".repeat(20_001), revision: 2 })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await saveJumpDraft({ workspaceId, jumpId, family: "TEXT", body: "B", revision: "2" })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await saveJumpDraft({ workspaceId, jumpId, family: "VIDEO", body: "B", revision: 2 })).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("serves the draft through the route with revision checks and account scoping", async () => {
    const read = await call("GET", jumpId, undefined, "?family=TEXT");
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ draft: { revision: 2 } });
    const stale = await call("PUT", jumpId, { family: "TEXT", body: "Stale", revision: 1 });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ reason: "conflict", draft: { revision: 2 } });
    const fresh = await call("PUT", jumpId, { family: "TEXT", body: "Hi {{First Name}}, all set.", revision: 2 });
    expect(fresh.status).toBe(200);
    expect(await fresh.json()).toMatchObject({ draft: { revision: 3, body: "Hi {{First Name}}, all set." } });
    expect((await call("PUT", jumpId, { family: "TEXT", body: "x".repeat(20_001), revision: 3 })).status).toBe(400);
    expect((await call("PUT", "not-a-follow-up", { family: "TEXT", body: "B", revision: null })).status).toBe(404);

    mocks.session.mockResolvedValueOnce({ user: { id: fixture.userId, memberships: [{ workspaceId }] }, impersonation: { id: "support" } });
    expect((await call("PUT", jumpId, { family: "TEXT", body: "B", revision: 3 })).status).toBe(403);
    mocks.session.mockResolvedValueOnce(null);
    expect((await call("GET", jumpId, undefined, "?family=TEXT")).status).toBe(401);
    mocks.session.mockResolvedValueOnce({ user: { id: "stranger", memberships: [{ workspaceId: "someone-else" }] }, impersonation: null });
    expect((await call("GET", jumpId, undefined, "?family=TEXT")).status).toBe(404);
  });

  it("includes drafts in the owner's export", async () => {
    const response = await exportAccount(new Request("https://example.test/api/account/export"));
    expect(response.status).toBe(200);
    const document = await response.json() as { followUpDrafts: Array<{ jumpId: string; body: string | null; revision: number }> };
    expect(document.followUpDrafts).toEqual([expect.objectContaining({ jumpId, body: "Hi {{First Name}}, all set.", revision: 3 })]);
  });

  it("discards only the revision the client saw, and treats an already-missing draft as discarded", async () => {
    expect(await discardJumpDraft({ workspaceId, jumpId, family: "TEXT", revision: 1 })).toMatchObject({ ok: false, reason: "conflict", draft: { revision: 3 } });
    const gone = await call("DELETE", jumpId, { family: "TEXT", revision: 3 });
    expect(gone.status).toBe(204);
    expect(await prisma.jumpDraft.count({ where: { jumpId } })).toBe(0);
    expect(await discardJumpDraft({ workspaceId, jumpId, family: "TEXT", revision: 3 })).toEqual({ ok: true });
    expect(await discardJumpDraft({ workspaceId, jumpId, family: "TEXT", revision: null })).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("refuses a draft once the follow-up is no longer pending", async () => {
    await prisma.jump.update({ where: { id: jumpId }, data: { status: "DONE", completedAt: new Date(), completionMethod: "outcome:completed" } });
    expect(await saveJumpDraft({ workspaceId, jumpId, family: "TEXT", body: "Too late", revision: null })).toMatchObject({ ok: false, reason: "unavailable" });
    expect((await call("PUT", jumpId, { family: "TEXT", body: "Too late", revision: null })).status).toBe(404);
  });
});
