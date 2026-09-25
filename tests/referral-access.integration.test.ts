import { openTestAdmission } from "./helpers/admission-fixture";
import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";
vi.mock("@/lib/env", async importOriginal => {
  const original = await importOriginal<typeof import("../src/lib/env")>();
  return { ...original, env: { ...original.env, pilotMode: false, dataEncryptionKey: "referral-integration-test-key" } };
});
import { allocateAccessInvite } from "../src/lib/referral-access";
import { runAutomaticDeliveries } from "../src/lib/automatic-delivery";
import { generateJumps } from "../src/lib/jump-engine";
import { createBusinessAccount } from "../src/lib/account-provisioning";
import { decryptIntegrationCredentials } from "../src/lib/integration-crypto";
import { hashAuthToken } from "../src/lib/auth-tokens";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const createdUsers: string[] = [];
async function owner() {
  const id = `access-${randomUUID()}`;
  const user = await prisma.user.create({ data: { id, name: "Network Owner", email: `${id}@example.com`, emailVerifiedAt: new Date() } });
  createdUsers.push(user.id);
  const workspace = await prisma.workspace.create({ data: { name: "Test", slug: id, ownerId: user.id } });
  const contacts = await Promise.all(Array.from({ length: 7 }, (_, i) => prisma.contact.create({ data: { workspaceId: workspace.id, displayName: `Person ${i}`, emails: { create: { email: `${id}-${i}@example.com`, normalized: `${id}-${i}@example.com` } } }, include: { emails: true } })));
  return { user, workspace, contacts };
}
describe.skipIf(!local)("referral access with PostgreSQL transactions", () => {
  let restoreAdmission: (() => Promise<void>) | undefined;
  beforeAll(async () => { restoreAdmission = await openTestAdmission(); });
  afterAll(async () => { await restoreAdmission?.(); });
  afterAll(async () => {
    await prisma.contactActivity.deleteMany({ where: { actorUserId: { in: createdUsers } } });
    await prisma.workspace.deleteMany({ where: { ownerId: { in: createdUsers } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
  });
  it("enforces three allocations under real concurrent requests", async () => {
    const { user, workspace, contacts } = await owner();
    const results = await Promise.allSettled(contacts.map(contact => prisma.$transaction(tx => allocateAccessInvite(tx, { expectedVersion: 1, userId: user.id, workspaceId: workspace.id, contactId: contact.id, recipientEmail: contact.emails[0].email }))));
    expect(results.filter(item => item.status === "fulfilled")).toHaveLength(3);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).referralInvitesIssued).toBe(3);
    expect(await prisma.referralAccessInvite.count({ where: { inviterUserId: user.id } })).toBe(3);
  });
  it("creates a phone invitation in Today with no queued mail, survives reconciliation, and admits one account only", async () => {
    const { user, workspace, contacts } = await owner();
    const phone = "+1555" + String(Date.now()).slice(-7);
    await prisma.contactPhone.create({ data: { contactId: contacts[0].id, phone, normalized: phone, isPrimary: true } });
    const input = { userId: user.id, workspaceId: workspace.id, contactId: contacts[0].id, recipientPhone: phone, expectedVersion: 1 };
    const invite = await prisma.$transaction(tx => allocateAccessInvite(tx, input));
    expect((await prisma.$transaction(tx => allocateAccessInvite(tx, input))).id).toBe(invite.id);
    expect(invite).toMatchObject({ recipientEmail: null, recipientPhone: phone, manualDelivery: true });
    const { token } = decryptIntegrationCredentials<{ token: string }>(invite.tokenCiphertext);
    const reminder = await prisma.jump.findUniqueOrThrow({ where: { accessInviteId: invite.id } });
    expect(reminder.status).toBe("PENDING");
    expect((reminder.renderedSnapshot as { body: string }).body).toContain(`/register?invite=${token}`);
    expect(await prisma.waitlistDelivery.count({ where: { inviteId: invite.id } })).toBe(0);
    await generateJumps({ workspaceId: workspace.id });
    expect((await prisma.jump.findUniqueOrThrow({ where: { id: reminder.id } })).status).toBe("PENDING");
    await prisma.automationPreference.create({ data: { workspaceId: workspace.id, enabled: true, smsEnabled: true, reviewWindowMinutes: 15 } });
    await prisma.jump.update({ where: { id: reminder.id }, data: { scheduledAt: new Date(Date.now() - 3600_000), createdAt: new Date(Date.now() - 3600_000) } });
    await runAutomaticDeliveries("personal-invite-test");
    expect(await prisma.automatedDelivery.count({ where: { jumpId: reminder.id } })).toBe(0);
    const results = await Promise.allSettled([1, 2].map(index => prisma.$transaction(tx => createBusinessAccount(tx, { email: `phone-${randomUUID()}-${index}@example.test`, name: "Phone guest", passwordHash: null, emailVerifiedAt: null, accessToken: token }))));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    for (const result of results) if (result.status === "fulfilled") createdUsers.push(result.value.id);
    expect((await prisma.jump.findUniqueOrThrow({ where: { id: reminder.id } })).status).toBe("CANCELED");
  });
  it("rolls back a failed signup and permits only one subsequent acceptance", async () => {
    const { user, workspace, contacts } = await owner();
    const contact = contacts[0];
    const invite = await prisma.$transaction(tx => allocateAccessInvite(tx, { expectedVersion: 1, userId: user.id, workspaceId: workspace.id, contactId: contact.id, recipientEmail: contact.emails[0].email }));
    const { token } = decryptIntegrationCredentials<{ token: string }>(invite.tokenCiphertext);
    const input = { email: contact.emails[0].email, name: "New Member", passwordHash: null, emailVerifiedAt: new Date(), accessToken: token };
    await expect(prisma.$transaction(async tx => { await createBusinessAccount(tx, input); throw new Error("simulated failure"); })).rejects.toThrow("simulated failure");
    expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: invite.id } })).acceptedAt).toBeNull();
    const results = await Promise.allSettled([prisma.$transaction(tx => createBusinessAccount(tx, input)), prisma.$transaction(tx => createBusinessAccount(tx, input))]);
    const successes = results.filter(item => item.status === "fulfilled");
    expect(successes).toHaveLength(1);
    for (const result of successes) if (result.status === "fulfilled") {
      createdUsers.push(result.value.id);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: result.value.id } })).referralInvitesIssued).toBe(0);
      expect(await prisma.notificationPreference.findUniqueOrThrow({ where: { workspaceId: result.value.workspaceId } })).toMatchObject({ emailDigestEnabled: false, weeklyReportEnabled: false });
    }
    await expect(prisma.$transaction(tx => createBusinessAccount(tx, { ...input, email: `${randomBytes(6).toString("hex")}@example.com` }))).rejects.toThrow();
  });
  it("treats an outstanding text invitation kept under an older spelling as the same number", async () => {
    const { user, workspace, contacts } = await owner();
    const national = `555${String(Date.now()).slice(-7)}`;
    await prisma.contactPhone.create({ data: { contactId: contacts[1].id, phone: `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`, normalized: national, isPrimary: true } });
    // Prepared before Release B: the stored key is the legacy key of the number as it was typed.
    const legacy = await prisma.referralAccessInvite.create({ data: { inviterUserId: user.id, workspaceId: workspace.id, contactId: contacts[1].id, recipientPhone: national, manualDelivery: true, tokenHash: hashAuthToken(randomUUID()), tokenCiphertext: "test-only" } });
    const again = await prisma.$transaction(tx => allocateAccessInvite(tx, { userId: user.id, workspaceId: workspace.id, contactId: contacts[1].id, recipientPhone: `+1 ${national}`, expectedVersion: 1 }));
    expect(again.id).toBe(legacy.id);
    // Another member typing the same number another way is told it already has an invitation.
    const other = await owner();
    await prisma.contactPhone.create({ data: { contactId: other.contacts[0].id, phone: `1-${national}`, normalized: `1${national}`, isPrimary: true } });
    await expect(prisma.$transaction(tx => allocateAccessInvite(tx, { userId: other.user.id, workspaceId: other.workspace.id, contactId: other.contacts[0].id, recipientPhone: `1-${national}`, expectedVersion: 1 }))).rejects.toThrow("This contact already has an invitation.");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.user.id } })).referralInvitesIssued).toBe(0);
  });
});

