import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { Prisma } from "../src/generated/prisma/client";
const settings = vi.hoisted(() => ({ pilotMode: false, appUrl: "https://example.test", dataEncryptionKey: "test-encryption-key-for-referral-invitations" }));
vi.mock("@/lib/env", () => ({ env: settings }));
vi.mock("@/lib/auth-tokens", () => ({ AUTH_TOKEN_PURPOSES: { invitationOptout: "invitation_optout" }, hashAuthToken: (token: string) => createHash("sha256").update(token).digest("hex") }));
import { DEFAULT_SYSTEM_MIX } from "../src/lib/system-mix";
import { allocateAccessInvite, claimAccessInvite, validAccessToken } from "../src/lib/referral-access";
import { decryptIntegrationCredentials } from "../src/lib/integration-crypto";
import { createBusinessAccount } from "../src/lib/account-provisioning";

function database(initial = 0) {
  let issued = initial;
  const records: any[] = [];
  const mocks = {
    $executeRaw: vi.fn(),
    admissionPolicy: { findUnique: vi.fn(async () => ({ accountCeiling: 1000, outstandingCeiling: 1000, grantsPaused: false, referralsPaused: false, redemptionPaused: false })) },
    emailSuppression: { findFirst: vi.fn(async () => null) },
    verificationToken: { create: vi.fn() },
    waitlistDelivery: { create: vi.fn() },
    waitlistEntry: { updateMany: vi.fn() },
    user: {
      findUnique: vi.fn(async ({ where }: any) => where.id ? { name: "Owner", emailVerifiedAt: new Date() } : null),
      count: vi.fn(async () => 0),
      updateMany: vi.fn(async ({ where }: any) => { if (issued >= where.referralInvitesIssued.lt) return { count: 0 }; issued++; return { count: 1 }; }),
      create: vi.fn(async () => ({ id: "new-user", name: "New User", email: "contact@example.com" }))
    },
    contact: { findFirst: vi.fn(async ({ where }: any) => where.workspaceId === "workspace" ? { id: where.id, displayName: "Contact", emails: [{ email: "contact@example.com" }] } : null) },
    referralAccessInvite: {
      count: vi.fn(async () => records.filter(item => !item.acceptedAt && !item.revokedAt).length),
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async ({ where }: any) => records.find(item => item.contactId === where.inviterUserId_contactId.contactId) ?? null),
      create: vi.fn(async ({ data }: any) => { const record = { id: `invite-${records.length}`, acceptedAt: null, revokedAt: null, ...data }; records.push(record); return record; }),
      updateMany: vi.fn(async ({ where, data }: any) => { const record = records.find(item => item.tokenHash === where.tokenHash && item.recipientEmail === where.recipientEmail && item.acceptedAt === null && item.revokedAt === null); if (!record) return { count: 0 }; Object.assign(record, data); return { count: 1 }; }),
      findUniqueOrThrow: vi.fn(async ({ where }: any) => records.find(item => item.tokenHash === where.tokenHash)),
      update: vi.fn()
    },
    systemMixConfig: { findUnique: vi.fn(async () => ({ id: "referral", publishedVersion: 1, draftVersion: 1 })) },
    systemMixRevision: { findUnique: vi.fn(async () => DEFAULT_SYSTEM_MIX) },
    workspace: { findFirst: vi.fn(async ({ where }: any) => where.id === "workspace" && where.ownerId === "owner" ? { id: "workspace" } : null), create: vi.fn(async () => ({ id: "new-workspace" })) },
    userPreference: { create: vi.fn() }, workspacePreference: { create: vi.fn() }, notificationPreference: { create: vi.fn() },
    contactActivity: { create: vi.fn() }
  };
  return { tx: mocks as unknown as Prisma.TransactionClient, mocks, records, issued: () => issued };
}
const input = (contactId = "contact") => ({ expectedVersion: 1, userId: "owner", workspaceId: "workspace", contactId, recipientEmail: "contact@example.com" });
beforeEach(() => { settings.pilotMode = false; });
describe("personal access invitations", () => {
  it("generates five distinct encrypted 256-bit tokens and rejects a sixth", async () => {
    const db = database();
    const invites = await Promise.all(Array.from({ length: 5 }, (_, i) => allocateAccessInvite(db.tx, input(`contact-${i}`))));
    const tokens = invites.map(invite => decryptIntegrationCredentials<{ token: string }>(invite.tokenCiphertext).token);
    expect(new Set(tokens).size).toBe(5);
    expect(tokens.every(validAccessToken)).toBe(true);
    expect(invites.every((invite, i) => !invite.tokenCiphertext.includes(tokens[i]) && invite.tokenHash !== tokens[i])).toBe(true);
    await expect(allocateAccessInvite(db.tx, input("sixth"))).rejects.toThrow("five invitations");
    expect(db.issued()).toBe(5);
  });
  it("uses a conditional atomic increment for competing last-slot requests", async () => {
    const db = database(4);
    const results = await Promise.allSettled([allocateAccessInvite(db.tx, input("a")), allocateAccessInvite(db.tx, input("b"))]);
    expect(results.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(db.mocks.user.updateMany).toHaveBeenCalledWith({ where: { id: "owner", referralInvitesIssued: { lt: 5 } }, data: { referralInvitesIssued: { increment: 1 } } });
  });
  it("retries the same contact without consuming another slot", async () => {
    const db = database();
    const first = await allocateAccessInvite(db.tx, input());
    expect(await allocateAccessInvite(db.tx, input())).toBe(first);
    expect(db.issued()).toBe(1);
  });
  it("rejects contacts from another workspace", async () => {
    const db = database();
    await expect(allocateAccessInvite(db.tx, { ...input(), workspaceId: "other" })).rejects.toThrow("own account");
    expect(db.issued()).toBe(0);
  });
  it("rejects an email not saved on the selected contact", async () => {
    const db = database();
    await expect(allocateAccessInvite(db.tx, { ...input(), recipientEmail: "attacker@example.com" })).rejects.toThrow("saved on this contact");
    expect(db.issued()).toBe(0);
  });
  it("requires a verified sender", async () => {
    const db = database(); db.mocks.user.findUnique.mockResolvedValueOnce({ emailVerifiedAt: null } as any);
    await expect(allocateAccessInvite(db.tx, input())).rejects.toThrow("Verify your email");
  });
  it("does not spend an invitation on an existing account", async () => {
    const db = database(); db.mocks.user.findUnique.mockResolvedValueOnce({ name: "Owner", emailVerifiedAt: new Date() }).mockResolvedValueOnce({ id: "existing" } as any);
    await expect(allocateAccessInvite(db.tx, input())).rejects.toThrow("already has an account");
    expect(db.issued()).toBe(0);
  });
  it("binds acceptance to the intended email and allows only one claim", async () => {
    const db = database(); const invite = await allocateAccessInvite(db.tx, input());
    const { token } = decryptIntegrationCredentials<{ token: string }>(invite.tokenCiphertext);
    await expect(claimAccessInvite(db.tx, token, "other@example.com")).rejects.toThrow("unavailable");
    expect(await claimAccessInvite(db.tx, token, " CONTACT@EXAMPLE.COM ")).toBe(invite.id);
    await expect(claimAccessInvite(db.tx, token, "contact@example.com")).rejects.toThrow("already been used");
  });
  it("blocks revoked links", async () => {
    const db = database(); const invite = await allocateAccessInvite(db.tx, input());
    db.records[0].revokedAt = new Date();
    const { token } = decryptIntegrationCredentials<{ token: string }>(invite.tokenCiphertext);
    await expect(claimAccessInvite(db.tx, token, "contact@example.com")).rejects.toThrow("unavailable");
  });
  it.each([undefined, "", "invalid"])("blocks new account creation without a valid unique URL (%s)", async accessToken => {
    const db = database();
    await expect(createBusinessAccount(db.tx, { email: "contact@example.com", name: "New", passwordHash: null, emailVerifiedAt: new Date(), accessToken })).rejects.toThrow("unique invitation link");
    expect(db.mocks.user.create).not.toHaveBeenCalled();
  });
  it("records referral attribution while creating the account", async () => {
    const db = database(); const invite = await allocateAccessInvite(db.tx, input());
    const { token } = decryptIntegrationCredentials<{ token: string }>(invite.tokenCiphertext);
    await createBusinessAccount(db.tx, { email: "contact@example.com", name: "New", passwordHash: null, emailVerifiedAt: null, accessToken: token });
    expect(db.mocks.referralAccessInvite.update).toHaveBeenCalledWith({ where: { id: invite.id }, data: { acceptedUserId: "new-user" } });
  });
  it("retains the private pilot's single-owner bootstrap", async () => {
    settings.pilotMode = true; const db = database();
    await expect(claimAccessInvite(db.tx, undefined, "owner@example.com")).resolves.toBeNull();
    db.mocks.user.count.mockResolvedValueOnce(1);
    await expect(claimAccessInvite(db.tx, undefined, "owner@example.com")).rejects.toThrow("Owner setup");
  });
});
