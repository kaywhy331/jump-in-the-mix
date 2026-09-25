import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { Prisma } from "../src/generated/prisma/client";
const settings = vi.hoisted(() => ({ pilotMode: false, appUrl: "https://example.test", dataEncryptionKey: "test-encryption-key-for-referral-invitations" }));
vi.mock("@/lib/env", () => ({ env: settings }));
vi.mock("@/lib/auth-tokens", () => ({ AUTH_TOKEN_PURPOSES: { invitationOptout: "invitation_optout" }, hashAuthToken: (token: string) => createHash("sha256").update(token).digest("hex") }));
// A stand-in for the phone-number contract ([canonical, legacy], deduplicated) that reads North American numbers.
vi.mock("@/lib/phone-number", () => ({
  workspacePhoneRegion: vi.fn(async () => "US"),
  phoneLookupKeys: (display: string) => {
    const legacy = display.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
    const digits = legacy.replace(/\D/g, "");
    if (digits.length < 7) return [];
    const canonical = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : legacy;
    return canonical === legacy ? [canonical] : [canonical, legacy];
  }
}));
import { DEFAULT_SYSTEM_MIX } from "../src/lib/system-mix";
import { allocateAccessInvite, claimAccessInvite, claimAccessInviteByHash, validAccessToken } from "../src/lib/referral-access";
import { workspacePhoneRegion } from "../src/lib/phone-number";
import { decryptIntegrationCredentials } from "../src/lib/integration-crypto";
import { createBusinessAccount } from "../src/lib/account-provisioning";

function database(initial = 0) {
  let issued = initial;
  const records: any[] = [];
  const mocks = {
    $executeRaw: vi.fn(),
    mix: { create: vi.fn(async () => ({ id: "mix" })) },
    stepTemplate: { create: vi.fn(async () => ({ id: "template" })) },
    stepVersion: { create: vi.fn(async () => ({ id: "version" })) },
    mixStep: { create: vi.fn(async () => ({ id: "step" })) },
    jump: { create: vi.fn(), updateMany: vi.fn() },
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
      findMany: vi.fn(async ({ where }: any) => records.filter(item => item.recipientPhone?.includes(where.recipientPhone.contains) && !item.acceptedAt && !item.revokedAt)),
      findUnique: vi.fn(async ({ where }: any) => where.id ? records.find(item => item.id === where.id) ?? null : records.find(item => item.contactId === where.inviterUserId_contactId.contactId) ?? null),
      create: vi.fn(async ({ data }: any) => { const record = { id: `invite-${records.length}`, acceptedAt: null, revokedAt: null, ...data }; records.push(record); return record; }),
      updateMany: vi.fn(async ({ where, data }: any) => { const record = records.find(item => item.tokenHash === where.tokenHash && (item.recipientEmail === where.OR[0].recipientEmail || item.recipientEmail === null && item.recipientPhone && item.manualDelivery) && item.acceptedAt === null && item.revokedAt === null); if (!record) return { count: 0 }; Object.assign(record, data); return { count: 1 }; }),
      findUniqueOrThrow: vi.fn(async ({ where }: any) => records.find(item => item.tokenHash === where.tokenHash)),
      update: vi.fn()
    },
    systemMixConfig: { findUnique: vi.fn(async () => ({ id: "referral", publishedVersion: 1, draftVersion: 1 })) },
    systemMixRevision: { findUnique: vi.fn(async () => DEFAULT_SYSTEM_MIX) },
    workspace: { findFirst: vi.fn(async ({ where }: any) => where.id === "workspace" && where.ownerId === "owner" ? { id: "workspace" } : null), create: vi.fn(async () => ({ id: "new-workspace" })) },
    userPreference: { create: vi.fn() }, workspacePreference: { create: vi.fn() }, workspaceMarketingPreference: { create: vi.fn() }, notificationPreference: { create: vi.fn() },
    contactActivity: { create: vi.fn() }
  };
  return { tx: mocks as unknown as Prisma.TransactionClient, mocks, records, issued: () => issued };
}
const input = (contactId = "contact") => ({ expectedVersion: 1, userId: "owner", workspaceId: "workspace", contactId, recipientEmail: "contact@example.com" });
beforeEach(() => { settings.pilotMode = false; });
describe("personal access invitations", () => {
  it("generates three distinct encrypted 256-bit tokens and rejects a fourth", async () => {
    const db = database();
    const invites = await Promise.all(Array.from({ length: 3 }, (_, i) => allocateAccessInvite(db.tx, input(`contact-${i}`))));
    const tokens = invites.map(invite => decryptIntegrationCredentials<{ token: string }>(invite.tokenCiphertext).token);
    expect(new Set(tokens).size).toBe(3);
    expect(tokens.every(validAccessToken)).toBe(true);
    expect(invites.every((invite, i) => !invite.tokenCiphertext.includes(tokens[i]) && invite.tokenHash !== tokens[i])).toBe(true);
    await expect(allocateAccessInvite(db.tx, input("fourth"))).rejects.toThrow("three invitations");
    expect(db.issued()).toBe(3);
  });
  it("uses a conditional atomic increment for competing last-slot requests", async () => {
    const db = database(2);
    const results = await Promise.allSettled([allocateAccessInvite(db.tx, input("a")), allocateAccessInvite(db.tx, input("b"))]);
    expect(results.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(db.mocks.user.updateMany).toHaveBeenCalledWith({ where: { id: "owner", referralInvitesIssued: { lt: 3 } }, data: { referralInvitesIssued: { increment: 1 } } });
  });
  it("retries the same contact without consuming another slot", async () => {
    const db = database();
    const first = await allocateAccessInvite(db.tx, input());
    expect(await allocateAccessInvite(db.tx, input())).toBe(first);
    expect(db.issued()).toBe(1);
    expect(db.mocks.jump.create).toHaveBeenCalledTimes(1);
    expect(db.mocks.waitlistDelivery.create).not.toHaveBeenCalled();
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
  it.each([
    { scenario: "painting", version: 1, restored: true },
    { scenario: "painting", version: 2, restored: false },
    { scenario: "painting", version: 0, restored: false },
    { scenario: "painting", version: null, restored: false },
    { scenario: "retired", version: 1, restored: false },
    { scenario: null, version: null, restored: false }
  ])("creates an account with safe starter fallback for $scenario version $version", async ({ scenario, version, restored }) => {
    const db = database(); const invite = await allocateAccessInvite(db.tx, input());
    Object.assign(db.records[0], { marketingScenario: scenario, marketingScenarioVersion: version });
    const { token } = decryptIntegrationCredentials<{ token: string }>(invite.tokenCiphertext);
    await createBusinessAccount(db.tx, { email: "contact@example.com", name: "New", passwordHash: null, emailVerifiedAt: null, accessToken: token });
    expect(db.mocks.user.create).toHaveBeenCalledTimes(1);
    if (restored) expect(db.mocks.workspaceMarketingPreference.create).toHaveBeenCalledWith({ data: { workspaceId: "new-workspace", scenario: "painting", version: 1 } });
    else expect(db.mocks.workspaceMarketingPreference.create).not.toHaveBeenCalled();
  });
  it("retains the private pilot's single-owner bootstrap", async () => {
    settings.pilotMode = true; const db = database();
    await expect(claimAccessInvite(db.tx, undefined, "owner@example.com")).resolves.toBeNull();
    db.mocks.user.count.mockResolvedValueOnce(1);
    await expect(claimAccessInvite(db.tx, undefined, "owner@example.com")).rejects.toThrow("Owner setup");
  });
});

const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");

describe("claiming an invitation", () => {
  it("claims by the stored hash for a Google or Apple sign-up, and only a well-formed hash", async () => {
    const db = database(); const invite = await allocateAccessInvite(db.tx, input());
    const { token } = decryptIntegrationCredentials<{ token: string }>(invite.tokenCiphertext);
    await expect(claimAccessInviteByHash(db.tx, "not-a-hash", "contact@example.com")).rejects.toMatchObject({ code: "NO_INVITATION" });
    await expect(claimAccessInviteByHash(db.tx, null, "contact@example.com")).rejects.toMatchObject({ code: "NO_INVITATION" });
    // An email invitation still binds to its address when claimed by hash.
    await expect(claimAccessInviteByHash(db.tx, hashOf(token), "other@example.com")).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(await claimAccessInviteByHash(db.tx, hashOf(token), "contact@example.com")).toBe(invite.id);
    await expect(claimAccessInviteByHash(db.tx, hashOf(token), "contact@example.com")).rejects.toMatchObject({ code: "UNAVAILABLE", message: "This invitation is unavailable or has already been used." });
  });
  it("gives every refusal a code, so each sign-up path can word it", async () => {
    const db = database();
    await expect(claimAccessInvite(db.tx, undefined, "person@example.com")).rejects.toMatchObject({ code: "NO_INVITATION" });
    db.mocks.admissionPolicy.findUnique.mockResolvedValueOnce({ accountCeiling: 1000, outstandingCeiling: 1000, grantsPaused: false, referralsPaused: false, redemptionPaused: true });
    await expect(claimAccessInvite(db.tx, "a".repeat(43), "person@example.com")).rejects.toMatchObject({ code: "REDEMPTION_PAUSED" });
    settings.pilotMode = true; db.mocks.user.count.mockResolvedValueOnce(1);
    await expect(claimAccessInvite(db.tx, undefined, "person@example.com")).rejects.toMatchObject({ code: "OWNER_SETUP_COMPLETE" });
  });
  it("creates an account from the invitation hash alone", async () => {
    const db = database(); const invite = await allocateAccessInvite(db.tx, input());
    const { token } = decryptIntegrationCredentials<{ token: string }>(invite.tokenCiphertext);
    await createBusinessAccount(db.tx, { email: "contact@example.com", name: "New", passwordHash: null, emailVerifiedAt: new Date(), accessTokenHash: hashOf(token) });
    expect(db.mocks.referralAccessInvite.update).toHaveBeenCalledWith({ where: { id: invite.id }, data: { acceptedUserId: "new-user" } });
    await expect(createBusinessAccount(db.tx, { email: "contact@example.com", name: "New", passwordHash: null, emailVerifiedAt: new Date(), accessTokenHash: null })).rejects.toMatchObject({ code: "NO_INVITATION" });
  });
});

describe("text invitations compare numbers, not spellings", () => {
  const phoneInput = (recipientPhone: string) => ({ expectedVersion: 1, userId: "owner", workspaceId: "workspace", contactId: "contact", recipientPhone });
  function savedNumber(db: ReturnType<typeof database>, phone = "(555) 010-0123") {
    db.mocks.contact.findFirst.mockImplementation((async ({ where }: any) => where.workspaceId === "workspace" ? { id: where.id, displayName: "Contact", emails: [], phones: [{ phone }] } : null) as any);
  }
  it("stores the canonical key, read in the workspace's region, for any spelling of a saved number", async () => {
    const db = database(); savedNumber(db);
    const invite = await allocateAccessInvite(db.tx, phoneInput("+1 555 010 0123"));
    expect(invite).toMatchObject({ recipientPhone: "+15550100123", recipientEmail: null, manualDelivery: true });
    expect(workspacePhoneRegion).toHaveBeenCalledWith(db.tx, "workspace");
    await expect(allocateAccessInvite(db.tx, { ...phoneInput("555 010 0199"), contactId: "contact-2" })).rejects.toThrow("Choose a phone number saved on this contact.");
  });
  it("returns an earlier invitation kept under an older spelling instead of calling it different details", async () => {
    const db = database(); savedNumber(db);
    db.records.push({ id: "legacy", inviterUserId: "owner", contactId: "contact", recipientEmail: null, recipientPhone: "5550100123", manualDelivery: true, acceptedAt: null, revokedAt: null, tokenHash: "legacy-hash" });
    expect(await allocateAccessInvite(db.tx, phoneInput("+1 (555) 010-0123"))).toMatchObject({ id: "legacy" });
    expect(db.issued()).toBe(0);
  });
  it("finds another member's outstanding invitation for the same number under any spelling", async () => {
    const db = database(); savedNumber(db);
    db.records.push({ id: "other", inviterUserId: "someone", contactId: "their-contact", workspaceId: "their-workspace", recipientEmail: null, recipientPhone: "15550100123", manualDelivery: true, acceptedAt: null, revokedAt: null, tokenHash: "other-hash" });
    await expect(allocateAccessInvite(db.tx, phoneInput("555.010.0123"))).rejects.toThrow("This contact already has an invitation.");
    expect(workspacePhoneRegion).toHaveBeenCalledWith(db.tx, "their-workspace");
    expect(db.issued()).toBe(0);
  });
});
