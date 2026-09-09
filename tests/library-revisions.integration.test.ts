import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";
vi.mock("@/lib/env", async original => { const mod = await original<typeof import("../src/lib/env")>(); return { ...mod, env: { ...mod.env, requireAdminMfa: true } }; });
import { saveLibraryDraft, releaseLibraryVersion } from "../src/lib/library-admin";
import { getLibraryState } from "../src/lib/library-store";
import { EMPTY_LIBRARY_CONTENT, type LibraryContent } from "../src/lib/library-content";
import { useSharedMixTemplate } from "../src/lib/shared-mix-use-service";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const users: string[] = [], mixes: string[] = [];
const password = "Library revision fixture!", passwordHash = await bcrypt.hash(password, 4);
const content: LibraryContent = { ...EMPTY_LIBRARY_CONTENT, title: "Keep in touch", description: "A thoughtful check-in after meeting someone.",
  steps: [{ ...EMPTY_LIBRARY_CONTENT.steps[0], body: "Hi {{First Name}}, how did your event go?", includeOptOut: true, longSms: true }] };
async function actor(publisher = true) {
  const user = await prisma.user.create({ data: { name: "Library editor", email: `library-${randomUUID()}@example.test`, emailVerifiedAt: new Date(), passwordHash,
    staffMembership: { create: { role: "EDITOR", grants: publisher ? ["mixes.publish"] : [] } } } }); users.push(user.id);
  const session = await prisma.session.create({ data: { userId: user.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600_000) } });
  await prisma.adminMfaSession.create({ data: { userId: user.id, sessionId: session.id, expiresAt: session.expiresAt } });
  return { actorUserId: user.id, actorSessionId: session.id, reason: "Reviewed relationship reminder content" };
}
async function draft(existing?: Awaited<ReturnType<typeof actor>>) {
  const a = existing ?? await actor();
  const row = await saveLibraryDraft({ ...a, expectedRevision: 0, content }); mixes.push(row.id); return { a, id: row.id };
}
async function release(a: Awaited<ReturnType<typeof actor>>, id: string, operation: "publish" | "rollback" | "unpublish" = "publish", version?: number) {
  const state = await getLibraryState(id);
  return releaseLibraryVersion({ ...a, sharedMixId: id, expectedRevision: state.controlRevision, version: version ?? state.draftVersion, password, operation });
}
async function customer(id: string, expectedVersion = 1) {
  const user = await prisma.user.create({ data: { email: `library-customer-${randomUUID()}@example.test`, name: "Library customer" } }); users.push(user.id);
  const workspace = await prisma.workspace.create({ data: { name: "Customer", slug: randomUUID(), ownerId: user.id } });
  return { actorUserId: user.id, workspaceId: workspace.id, sharedMixId: id, expectedVersion, requestId: randomUUID(), name: "My own mix", status: "DRAFT" as const, groupIds: [], assignAllContacts: true };
}
describe.skipIf(!local)("immutable library versions on PostgreSQL", () => {
  afterEach(async () => {
    const imports = await prisma.sharedMixImport.findMany({ where: { sharedMixId: { in: mixes } }, select: { id: true } });
    await prisma.sharedMixImportMetadata.deleteMany({ where: { importId: { in: imports.map(row => row.id) } } });
    await prisma.sharedMixMetadata.deleteMany({ where: { sharedMixId: { in: mixes } } });
    await prisma.sharedMix.deleteMany({ where: { id: { in: mixes } } });
    await prisma.workspace.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.adminMfaSession.deleteMany({ where: { userId: { in: users } } });
    await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } }); users.length = 0; mixes.length = 0;
  }, 30_000);
  it("lets a staff-only editor draft without changing published content or gaining publication rights", async () => {
    const a = await actor(false), { id } = await draft(a);
    expect(await prisma.workspace.count({ where: { ownerId: a.actorUserId } })).toBe(0);
    await expect(release(a, id)).rejects.toThrow("staff access");
    await prisma.staffMembership.update({ where: { userId: a.actorUserId }, data: { grants: ["mixes.publish"] } }); await release(a, id);
    await prisma.staffMembership.update({ where: { userId: a.actorUserId }, data: { grants: [] } });
    await saveLibraryDraft({ ...a, sharedMixId: id, expectedRevision: 2, content: { ...content, title: "Future title" } });
    const state = await getLibraryState(id);
    expect(state).toMatchObject({ version: 1, draftVersion: 2, controlRevision: 3, published: { title: "Keep in touch" }, draft: { title: "Future title" } });
  });
  it("serializes concurrent edits and refuses stale publication without changing live content", async () => {
    const { a, id } = await draft();
    const outcomes = await Promise.allSettled(["A", "B"].map(title => saveLibraryDraft({ ...a, sharedMixId: id, expectedRevision: 1, content: { ...content, title } })));
    expect(outcomes.filter(row => row.status === "fulfilled")).toHaveLength(1);
    await expect(releaseLibraryVersion({ ...a, sharedMixId: id, expectedRevision: 1, version: 1, password, operation: "publish" })).rejects.toThrow("mix changed");
    expect((await getLibraryState(id)).shared.status).toBe("UNPUBLISHED");
    expect(await prisma.sharedMixRevision.count({ where: { sharedMixId: id } })).toBe(2);
  });
  it("requires a live session, current permission, password, and recent MFA to publish", async () => {
    const { a, id } = await draft(); const input = { ...a, sharedMixId: id, expectedRevision: 1, version: 1, password, operation: "publish" as const };
    await expect(releaseLibraryVersion({ ...input, password: "wrong" })).rejects.toThrow("password");
    await expect(releaseLibraryVersion({ ...input, actorSessionId: "missing" })).rejects.toThrow("staff access");
    await prisma.adminMfaSession.updateMany({ where: { sessionId: a.actorSessionId }, data: { verifiedAt: new Date(Date.now() - 11 * 60_000) } });
    await expect(releaseLibraryVersion(input)).rejects.toMatchObject({ needsMfa: true });
    await prisma.staffMembership.update({ where: { userId: a.actorUserId }, data: { denies: ["mixes.publish"] } });
    await expect(releaseLibraryVersion(input)).rejects.toThrow("staff access");
    expect(await prisma.sharedMixRelease.count({ where: { sharedMixId: id } })).toBe(0);
  });
  it("publishes, rolls back a previously published version, and preserves a customer's independent copy", async () => {
    const { a, id } = await draft(); await release(a, id);
    const input = await customer(id), first = await useSharedMixTemplate(input);
    await saveLibraryDraft({ ...a, sharedMixId: id, expectedRevision: 2, content: { ...content, title: "Second edition", steps: [{ ...content.steps[0], body: "An entirely different message" }] } });
    await release(a, id);
    expect((await getLibraryState(id)).version).toBe(2);
    await expect(useSharedMixTemplate({ ...input, requestId: randomUUID() })).rejects.toThrow("changed since your preview");
    const second = await useSharedMixTemplate({ ...input, expectedVersion: 2, requestId: randomUUID() });
    await release(a, id, "rollback", 1);
    expect((await getLibraryState(id)).published.steps[0].body).toBe(content.steps[0].body);
    const [original, updated] = await Promise.all([first, second].map(row => prisma.mix.findUniqueOrThrow({ where: { id: row.mixId }, include: { steps: { include: { stepVersion: true } } } })));
    expect(original.steps[0].stepVersion.body).toBe(content.steps[0].body);
    expect(updated.steps[0].stepVersion.body).toBe("An entirely different message");
    expect(original.steps[0].stepVersion.includeOptOut).toBe(true);
    expect(await useSharedMixTemplate(input)).toEqual({ mixId: first.mixId, repeated: true });
    const events = await prisma.sharedMixRelease.findMany({ where: { sharedMixId: id }, orderBy: { controlRevision: "asc" } });
    expect(events.map(row => [row.action, row.version])).toEqual([["PUBLISH", 1], ["PUBLISH", 2], ["ROLLBACK", 1]]);
    const audit = await prisma.platformAuditEvent.findFirstOrThrow({ where: { entityId: id, action: "library.rollback" } });
    expect(audit.beforeData).toMatchObject({ version: 2 }); expect(audit.afterData).toMatchObject({ version: 1 });
    expect(JSON.stringify(audit)).not.toContain(password);
  });
  it("does not allow rollback to an unpublished draft or import a hidden version", async () => {
    const { a, id } = await draft(); await release(a, id);
    const setup = await customer(id);
    await saveLibraryDraft({ ...a, sharedMixId: id, expectedRevision: 2, content: { ...content, title: "Unreviewed" } });
    await expect(release(a, id, "rollback", 2)).rejects.toThrow("previously published");
    await release(a, id, "unpublish", 1);
    await expect(useSharedMixTemplate(setup)).rejects.toThrow("not currently available");
    expect(await prisma.mix.count({ where: { workspaceId: setup.workspaceId } })).toBe(0);
    await release(a, id, "rollback", 1); expect((await getLibraryState(id)).shared.status).toBe("APPROVED");
  });
  it("enforces immutable history in PostgreSQL while allowing parent maintenance cleanup", async () => {
    const { a, id } = await draft(); await release(a, id);
    await expect(prisma.sharedMixRevision.updateMany({ where: { sharedMixId: id }, data: { snapshot: {} } })).rejects.toThrow("immutable");
    await expect(prisma.sharedMixRevision.deleteMany({ where: { sharedMixId: id } })).rejects.toThrow("immutable");
    await expect(prisma.sharedMixRelease.updateMany({ where: { sharedMixId: id }, data: { version: 8 } })).rejects.toThrow("immutable");
    expect(await prisma.sharedMixRevision.count({ where: { sharedMixId: id } })).toBe(1);
  });
  it("validates placeholders, private-note boundaries, date triggers, and exact timing before saving", async () => {
    const a = await actor();
    for (const bad of [
      { ...content, steps: [{ ...content.steps[0], body: "{{Private Notes}}" }] },
      { ...content, steps: [{ ...content.steps[0], body: "{{secret_administrator_instruction}}" }] },
      { ...content, steps: [{ ...content.steps[0], dayOffset: 0.5 }] },
      { ...content, triggerMode: "DATE_TRIGGERED" as const }
    ]) await expect(saveLibraryDraft({ ...a, expectedRevision: 0, content: bad })).rejects.toThrow();
    expect(await prisma.sharedMixRevision.count({ where: { actorUserId: a.actorUserId } })).toBe(0);
  });
  it("rechecks visibility when an import competes with unpublication", async () => {
    const { a, id } = await draft(); await release(a, id); const input = await customer(id);
    const outcomes = await Promise.allSettled([release(a, id, "unpublish", 1), useSharedMixTemplate(input)]);
    expect(outcomes[0].status).toBe("fulfilled");
    const rows = await prisma.sharedMixImport.findMany({ where: { workspaceId: input.workspaceId } });
    expect(rows).toHaveLength(outcomes[1].status === "fulfilled" ? 1 : 0);
    await expect(useSharedMixTemplate({ ...input, requestId: randomUUID() })).rejects.toThrow("not currently available");
  });
  it("serializes duplicate setup requests and refuses another user's workspace", async () => {
    const { a, id } = await draft(); await release(a, id); const input = await customer(id);
    const results = await Promise.all([useSharedMixTemplate(input), useSharedMixTemplate(input)]);
    expect(results[0].mixId).toBe(results[1].mixId);
    expect(results.filter(row => row.repeated)).toHaveLength(1);
    await expect(useSharedMixTemplate({ ...input, actorUserId: a.actorUserId })).rejects.toThrow("workspace is unavailable");
  });
});
