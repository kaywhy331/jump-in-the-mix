import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";
import { openTestAdmission } from "./helpers/admission-fixture";
import { preserveSystemMixFixture } from "./helpers/system-mix-fixture";
vi.mock("@/lib/env", async original => { const mod = await original<typeof import("../src/lib/env")>(); return { ...mod, env: { ...mod.env, requireAdminMfa: true, dataEncryptionKey: "system-mix-releases-test-key" } }; });
import { DEFAULT_SYSTEM_MIX } from "../src/lib/system-mix";
import { getSystemMixState, installSystemMixBaseline } from "../src/lib/system-mix-store";
import { saveSystemMixDraft, releaseSystemMix } from "../src/lib/system-mix-admin";
import { allocateAccessInvite } from "../src/lib/referral-access";
import { decryptIntegrationCredentials } from "../src/lib/integration-crypto";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const users: string[] = [], emails: string[] = [];
const password = "System Mix release fixture!", passwordHash = await bcrypt.hash(password, 4);
const changed = { subject: "A personal invitation from {{Sender Name}}", body: "Hi {{Contact Name}},\n\nI use Jump in the Mix to keep track of the people I want to stay in touch with. Here is one of my five personal invitations to a free account.\n\n{{Sender Name}}" };
async function actor(publisher = true) {
  const user = await prisma.user.create({ data: { name: "System Mix editor", email: `system-editor-${randomUUID()}@example.test`, emailVerifiedAt: new Date(), passwordHash,
    staffMembership: { create: { role: "EDITOR", grants: publisher ? ["mixes.publish"] : [] } } } }); users.push(user.id);
  const session = await prisma.session.create({ data: { userId: user.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600_000) } });
  await prisma.adminMfaSession.create({ data: { userId: user.id, sessionId: session.id, expiresAt: session.expiresAt } });
  return { actorUserId: user.id, actorSessionId: session.id, reason: "Review the personal invitation introduction" };
}
async function member() {
  const user = await prisma.user.create({ data: { name: "Network Owner", email: `system-member-${randomUUID()}@example.test`, emailVerifiedAt: new Date() } }); users.push(user.id);
  const workspace = await prisma.workspace.create({ data: { ownerId: user.id, name: "Member", slug: randomUUID() } });
  const inputs = [];
  for (let i = 0; i < 3; i++) {
    const email = `system-contact-${randomUUID()}@example.test`; emails.push(email);
    const contact = await prisma.contact.create({ data: { workspaceId: workspace.id, displayName: `Friend ${i}`, emails: { create: { email, normalized: email } } } });
    inputs.push({ userId: user.id, workspaceId: workspace.id, contactId: contact.id, recipientEmail: email, expectedVersion: 1, expectedSender: user.name, expectedContact: contact.displayName });
  }
  return { user, workspace, inputs };
}
async function draft(a: Awaited<ReturnType<typeof actor>>) { return saveSystemMixDraft({ ...a, expectedRevision: (await getSystemMixState()).config.controlRevision, content: changed }); }
async function release(a: Awaited<ReturnType<typeof actor>>, version: number, operation: "publish" | "rollback" = "publish") {
  return releaseSystemMix({ ...a, expectedRevision: (await getSystemMixState()).config.controlRevision, password, version, operation });
}
describe.skipIf(!local)("System Mix revisions and frozen referrals on PostgreSQL", () => {
  let restoreContent: (() => Promise<unknown>) | undefined, restoreAdmission: (() => Promise<void>) | undefined;
  beforeEach(async () => { restoreContent = await preserveSystemMixFixture(); restoreAdmission = await openTestAdmission(); });
  afterEach(async () => {
    await prisma.workspace.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.adminMfaSession.deleteMany({ where: { userId: { in: users } } });
    await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.verificationToken.deleteMany({ where: { email: { in: emails } } });
    await restoreContent?.(); await restoreAdmission?.(); users.length = 0; emails.length = 0;
  }, 30_000);
  it("preserves the migration baseline and permits staff-only drafts without publication rights", async () => {
    const baseline = await getSystemMixState(); expect(baseline.published).toMatchObject(DEFAULT_SYSTEM_MIX);
    const a = await actor(false); await draft(a);
    expect(await prisma.workspace.count({ where: { ownerId: a.actorUserId } })).toBe(0);
    expect((await getSystemMixState()).published).toMatchObject(DEFAULT_SYSTEM_MIX);
    await expect(release(a, 2)).rejects.toThrow("staff access");
  });
  it("rejects concurrent stale edits, stale publication, expired MFA, missing sessions and removed permissions", async () => {
    const a = await actor();
    const results = await Promise.allSettled([1, 2].map(() => saveSystemMixDraft({ ...a, expectedRevision: 0, content: changed })));
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    await expect(releaseSystemMix({ ...a, expectedRevision: 0, version: 2, password, operation: "publish" })).rejects.toThrow("changed");
    await expect(releaseSystemMix({ ...a, expectedRevision: 1, version: 2, password: "wrong", operation: "publish" })).rejects.toThrow("password");
    await expect(releaseSystemMix({ ...a, actorSessionId: "missing", expectedRevision: 1, version: 2, password, operation: "publish" })).rejects.toThrow("staff access");
    await prisma.adminMfaSession.updateMany({ where: { sessionId: a.actorSessionId }, data: { verifiedAt: new Date(Date.now() - 11 * 60_000) } });
    await expect(release(a, 2)).rejects.toMatchObject({ needsMfa: true });
    await prisma.staffMembership.update({ where: { userId: a.actorUserId }, data: { denies: ["mixes.publish"] } });
    await expect(release(a, 2)).rejects.toThrow("staff access");
    expect((await getSystemMixState()).config.publishedVersion).toBe(1);
  });
  it("publishes and rolls back future invitations while queued payloads and duplicate requests stay unchanged", async () => {
    const a = await actor(), m = await member();
    const first = await prisma.$transaction(tx => allocateAccessInvite(tx, m.inputs[0]));
    const original = await prisma.waitlistDelivery.findUniqueOrThrow({ where: { inviteId: first.id } });
    expect(first.systemMixVersion).toBe(1); await draft(a); await release(a, 2);
    await expect(prisma.$transaction(tx => allocateAccessInvite(tx, m.inputs[1]))).rejects.toThrow("preview changed");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: m.user.id } })).referralInvitesIssued).toBe(1);
    const second = await prisma.$transaction(tx => allocateAccessInvite(tx, { ...m.inputs[1], expectedVersion: 2 }));
    const delivery = await prisma.waitlistDelivery.findUniqueOrThrow({ where: { inviteId: second.id } });
    const message = decryptIntegrationCredentials<{ subject: string; text: string; html: string }>(delivery.messageCiphertext);
    expect(message.subject).toBe("A personal invitation from Network Owner"); expect(message.text).toContain(m.inputs[1].recipientEmail);
    expect(message.text).toContain("/register?invite="); expect(message.text).toContain("/waitlist/leave?token=");
    expect(second.systemMixVersion).toBe(2);
    await release(a, 1, "rollback");
    expect((await prisma.$transaction(tx => allocateAccessInvite(tx, { ...m.inputs[1], expectedVersion: 999 }))).id).toBe(second.id);
    const third = await prisma.$transaction(tx => allocateAccessInvite(tx, m.inputs[2])); expect(third.systemMixVersion).toBe(1);
    expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { inviteId: first.id } })).messageCiphertext).toBe(original.messageCiphertext);
    expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { inviteId: second.id } })).messageCiphertext).toBe(delivery.messageCiphertext);
    expect((await prisma.platformAuditEvent.findFirstOrThrow({ where: { actorUserId: a.actorUserId, action: "system_mix.rollback" } })).afterData).toMatchObject({ version: 1 });
  });
  it("serializes publication with invitation allocation and never sends unseen new wording", async () => {
    const a = await actor(), m = await member(); await draft(a);
    const [publication, invitation] = await Promise.allSettled([release(a, 2), prisma.$transaction(tx => allocateAccessInvite(tx, m.inputs[0]))]);
    expect(publication.status).toBe("fulfilled");
    if (invitation.status === "fulfilled") expect(invitation.value.systemMixVersion).toBe(1);
    else expect(invitation.reason.message).toContain("preview changed");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: m.user.id } })).referralInvitesIssued).toBe(invitation.status === "fulfilled" ? 1 : 0);
  });
  it("requires previous publication for rollback and enforces immutable history", async () => {
    const a = await actor(); await draft(a);
    await expect(release(a, 2, "rollback")).rejects.toThrow("previously published");
    await expect(prisma.systemMixRevision.updateMany({ data: { body: "replacement" } })).rejects.toThrow("immutable");
    await expect(prisma.systemMixRevision.deleteMany()).rejects.toThrow("immutable");
    await expect(prisma.systemMixRelease.updateMany({ data: { version: 2 } })).rejects.toThrow("immutable");
    await expect(prisma.systemMixRelease.deleteMany()).rejects.toThrow("immutable");
    expect((await getSystemMixState()).published).toMatchObject(DEFAULT_SYSTEM_MIX);
  });
  it("rechecks preview names and workspace ownership before spending an invitation", async () => {
    const m = await member(), foreign = await member();
    await expect(prisma.$transaction(tx => allocateAccessInvite(tx, { ...m.inputs[0], userId: foreign.user.id }))).rejects.toThrow("own account");
    await prisma.contact.update({ where: { id: m.inputs[0].contactId }, data: { displayName: "A changed name" } });
    await expect(prisma.$transaction(tx => allocateAccessInvite(tx, m.inputs[0]))).rejects.toThrow("preview changed");
    await prisma.user.update({ where: { id: m.user.id }, data: { name: "A changed sender" } });
    await expect(prisma.$transaction(tx => allocateAccessInvite(tx, m.inputs[1]))).rejects.toThrow("preview changed");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: m.user.id } })).referralInvitesIssued).toBe(0);
  });
  it("fails closed when the published configuration is absent", async () => {
    const m = await member(); await prisma.systemMixConfig.delete({ where: { id: "referral" } });
    await expect(prisma.$transaction(tx => allocateAccessInvite(tx, m.inputs[0]))).rejects.toThrow("temporarily unavailable");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: m.user.id } })).referralInvitesIssued).toBe(0);
  });
  it("installs a missing local baseline once and never overwrites administrator work on reseeding", async () => {
    await prisma.systemMixConfig.delete({ where: { id: "referral" } });
    expect(await installSystemMixBaseline()).toBe(true);
    const a = await actor(); await draft(a); await release(a, 2); await draft(a); await release(a, 1, "rollback");
    const before = await getSystemMixState();
    expect(await installSystemMixBaseline()).toBe(false);
    expect(await getSystemMixState()).toEqual(before);
  });
});
