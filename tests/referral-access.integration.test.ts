import { openTestAdmission } from "./helpers/admission-fixture";
import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";
vi.mock("@/lib/env", async importOriginal => {
  const original = await importOriginal<typeof import("../src/lib/env")>();
  return { ...original, env: { ...original.env, pilotMode: false, dataEncryptionKey: "referral-integration-test-key" } };
});
import { allocateAccessInvite } from "../src/lib/referral-access";
import { createBusinessAccount } from "../src/lib/account-provisioning";
import { decryptIntegrationCredentials } from "../src/lib/integration-crypto";

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
  it("enforces five allocations under real concurrent requests", async () => {
    const { user, workspace, contacts } = await owner();
    const results = await Promise.allSettled(contacts.map(contact => prisma.$transaction(tx => allocateAccessInvite(tx, { expectedVersion: 1, userId: user.id, workspaceId: workspace.id, contactId: contact.id, recipientEmail: contact.emails[0].email }))));
    expect(results.filter(item => item.status === "fulfilled")).toHaveLength(5);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).referralInvitesIssued).toBe(5);
    expect(await prisma.referralAccessInvite.count({ where: { inviterUserId: user.id } })).toBe(5);
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
});
