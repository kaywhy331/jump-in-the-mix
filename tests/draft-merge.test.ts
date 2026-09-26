import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { reconcileJumps } from "../src/lib/jump-engine";
import { saveJumpDraft } from "../src/lib/jump-drafts";
import { prisma } from "../src/lib/prisma";
import { createBroadcastFixture, type BroadcastFixture } from "./helpers/broadcast-fixture";

const mocks = vi.hoisted(() => ({ requireWorkspace: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: mocks.requireWorkspace }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
import { mergeContactsAction } from "../src/lib/contact-merge-actions";

const merge = async (survivorContactId: string, sourceContactId: string, confirmation: string) => {
  const form = new FormData();
  form.set("survivorContactId", survivorContactId);
  form.set("sourceContactId", sourceContactId);
  form.set("confirmation", confirmation);
  await expect(mergeContactsAction(form)).rejects.toThrow(`REDIRECT /contacts/${survivorContactId}?merged=1`);
};
const draftsOf = (jumpId: string) => prisma.jumpDraft.findMany({ where: { jumpId }, orderBy: { family: "asc" } });

describe.sequential("merging duplicate contacts keeps prepared drafts", () => {
  let fixture: BroadcastFixture;
  let survivorId: string;
  const body = "Hi {{First Name}}, I kept this wording on purpose.";

  beforeAll(async () => {
    fixture = await createBroadcastFixture("draft-merge", "Sam");
    survivorId = (await prisma.contact.create({ data: { workspaceId: fixture.workspaceId, firstName: "Samuel", displayName: "Samuel" } })).id;
    mocks.requireWorkspace.mockResolvedValue({ user: { id: fixture.userId }, workspace: { id: fixture.workspaceId }, impersonation: null });
  });
  afterAll(() => fixture.cleanup());

  it("moves the draft onto the survivor's matching follow-up when that row already exists", async () => {
    const mixId = await fixture.addBroadcast("Shared broadcast", -1);
    await prisma.mixAssignment.create({ data: { assignmentKey: `${fixture.workspaceId}:${mixId}:audience:${survivorId}`, workspaceId: fixture.workspaceId, mixId, contactId: survivorId, mode: "DYNAMIC" } });
    await reconcileJumps({ workspaceId: fixture.workspaceId, mixId });
    const sourceJump = await prisma.jump.findFirstOrThrow({ where: { mixId, contactId: fixture.contactId, status: "PENDING" } });
    const survivorJump = await prisma.jump.findFirstOrThrow({ where: { mixId, contactId: survivorId, status: "PENDING" } });
    expect((await saveJumpDraft({ workspaceId: fixture.workspaceId, jumpId: sourceJump.id, family: "TEXT", body, revision: null })).ok).toBe(true);
    const source = await prisma.contact.findUniqueOrThrow({ where: { id: fixture.contactId } });
    await merge(survivorId, fixture.contactId, source.displayName);
    expect((await prisma.jump.findUniqueOrThrow({ where: { id: sourceJump.id } })).status).toBe("CANCELED");
    expect(await draftsOf(sourceJump.id)).toEqual([]);
    expect(await draftsOf(survivorJump.id)).toMatchObject([{ family: "TEXT", body, revision: 1 }]);
    // Merging is one-way: restore the source so the next case can use it again.
    await prisma.contact.update({ where: { id: fixture.contactId }, data: { archivedAt: null } });
  });

  it("keeps the draft on the cancelled row and carries it onto the survivor's regenerated follow-up", async () => {
    const mixId = await fixture.addBroadcast(`Solo broadcast ${randomUUID().slice(0, 6)}`, -1);
    await reconcileJumps({ workspaceId: fixture.workspaceId, mixId });
    const sourceJump = await prisma.jump.findFirstOrThrow({ where: { mixId, contactId: fixture.contactId, status: "PENDING" } });
    expect((await saveJumpDraft({ workspaceId: fixture.workspaceId, jumpId: sourceJump.id, family: "TEXT", body, revision: null })).ok).toBe(true);
    const source = await prisma.contact.findUniqueOrThrow({ where: { id: fixture.contactId } });
    await merge(survivorId, fixture.contactId, source.displayName);
    // Nothing was deleted by the merge itself.
    expect((await prisma.jump.findUniqueOrThrow({ where: { id: sourceJump.id } })).completionMethod).toBe("contact_merged");
    expect(await draftsOf(sourceJump.id)).toMatchObject([{ family: "TEXT", body }]);
    // The worker's next pass generates the survivor's row for the same beat and occurrence and carries the draft.
    const result = await reconcileJumps({ workspaceId: fixture.workspaceId, mixId });
    expect(result.created).toBe(1);
    const survivorJump = await prisma.jump.findFirstOrThrow({ where: { mixId, contactId: survivorId, status: "PENDING" } });
    expect(await draftsOf(survivorJump.id)).toMatchObject([{ family: "TEXT", body, revision: 1 }]);
    expect(await draftsOf(sourceJump.id)).toEqual([]);
    expect(survivorJump.renderedSnapshot).toMatchObject({ body: "Hi Samuel" });
  });
});
