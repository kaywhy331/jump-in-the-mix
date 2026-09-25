import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rate: vi.fn(), allocate: vi.fn(), update: vi.fn(), cancel: vi.fn(), cancelReminder: vi.fn(), contacts: vi.fn(), createContact: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: mocks.auth }));
vi.mock("@/lib/env", () => ({ env: { pilotMode: false } }));
vi.mock("@/lib/integration-crypto", () => ({ integrationEncryptionConfigured: () => true }));
vi.mock("@/lib/referral-access", () => ({ AccessInviteError: class extends Error {}, allocateAccessInvite: mocks.allocate }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  workspacePreference: { findUnique: async () => null },
  $transaction: (fn: any) => fn({ $executeRaw: vi.fn(), referralAccessInvite: { updateMany: mocks.update }, waitlistDelivery: { updateMany: mocks.cancel }, jump: { updateMany: mocks.cancelReminder }, contact: { findMany: mocks.contacts, create: mocks.createContact } })
} }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.rate }));
import { sendSystemInviteAction, revokeSystemInviteAction } from "../src/lib/system-mix-actions";
function form(addresses = ["contact@example.com"]) { const data = new FormData(); data.set("systemMixVersion", "1"); data.set("previewSender", "Owner"); addresses.forEach((address, index) => { data.append("address", address); data.append("name", `Contact ${index}`); data.append("contactId", `contact-${index}`); }); return data; }
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "owner", name: "Owner", emailVerifiedAt: new Date() }, workspace: { id: "workspace" }, impersonation: null });
  mocks.rate.mockResolvedValue({ allowed: true }); mocks.allocate.mockResolvedValue({ id: "invite", acceptedAt: null, revokedAt: null });
  mocks.update.mockResolvedValue({ count: 1 }); mocks.contacts.mockResolvedValue([]); mocks.createContact.mockResolvedValue({ id: "created-contact" });
});
describe("personal invitation reminders", () => {
  it("prepares email and text reminders together and redirects to Today", async () => {
    await expect(sendSystemInviteAction(form(["CONTACT@example.com", "+1 (555) 010-0123"]))).rejects.toThrow("REDIRECT /jumps?invitations=2");
    expect(mocks.allocate).toHaveBeenCalledTimes(2);
    expect(mocks.allocate).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({ userId: "owner", workspaceId: "workspace", recipientPhone: "+15550100123", recipientEmail: undefined, expectedVersion: 1 }));
  });
  it("matches a saved contact under both phone keys, saves a new one under the canonical key, and treats two spellings of one number as one", async () => {
    const data = form(["(555) 010-0124"]); data.delete("contactId");
    await expect(sendSystemInviteAction(data)).rejects.toThrow("invitations=1");
    expect(mocks.contacts).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ phones: { some: { normalized: { in: ["+15550100124", "5550100124"] } } } }) }));
    expect(mocks.createContact).toHaveBeenCalledWith({ data: expect.objectContaining({ phones: { create: { phone: "5550100124", normalized: "+15550100124", isPrimary: true } } }) });
    await expect(sendSystemInviteAction(form(["(555) 010-0125", "+1 555 010 0125"]))).rejects.toThrow("different%20email%20address%20or%20text%20number");
  });
  it.each([[], ["one@example.com", "two@example.com", "three@example.com", "four@example.com"], ["invalid"], ["same@example.com", "SAME@example.com"]].map(addresses => ({ addresses })))("rejects invalid or oversized batches before allocating: $addresses", async ({ addresses }) => {
    await expect(sendSystemInviteAction(form(addresses))).rejects.toThrow("/mixes/system?error=");
    expect(mocks.allocate).not.toHaveBeenCalled();
  });
  it("reuses a matching contact when details are entered directly", async () => {
    mocks.contacts.mockResolvedValue([{ id: "saved-contact" }]); const data = form(); data.delete("contactId");
    await expect(sendSystemInviteAction(data)).rejects.toThrow("invitations=1");
    expect(mocks.allocate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ contactId: "saved-contact" }));
    expect(mocks.createContact).not.toHaveBeenCalled();
  });
  it("blocks impersonation", async () => {
    mocks.auth.mockResolvedValue({ user: {}, workspace: {}, impersonation: {} });
    await expect(sendSystemInviteAction(form())).rejects.toThrow("view-only"); expect(mocks.allocate).not.toHaveBeenCalled();
  });
  it("requires authentication and verified email", async () => {
    mocks.auth.mockRejectedValueOnce(new Error("Sign in required"));
    await expect(sendSystemInviteAction(form())).rejects.toThrow("Sign in required");
    mocks.auth.mockResolvedValue({ user: { id: "owner" }, workspace: { id: "workspace" } });
    await expect(sendSystemInviteAction(form())).rejects.toThrow("Verify%20your%20email"); expect(mocks.allocate).not.toHaveBeenCalled();
  });
  it("rate limits preparation", async () => {
    mocks.rate.mockResolvedValue({ allowed: false });
    await expect(sendSystemInviteAction(form())).rejects.toThrow("Too%20many"); expect(mocks.allocate).not.toHaveBeenCalled();
  });
  it("scopes revocation to the owner and cancels the reminder and any legacy delivery", async () => {
    const data = new FormData(); data.set("id", "invite");
    await expect(revokeSystemInviteAction(data)).rejects.toThrow("revoked=1");
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "invite", inviterUserId: "owner", workspaceId: "workspace", acceptedAt: null, revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(mocks.cancelReminder).toHaveBeenCalledWith(expect.objectContaining({ where: { accessInviteId: "invite", workspaceId: "workspace", status: "PENDING" } }));
  });
  it("cannot revoke another account's invitation", async () => {
    mocks.update.mockResolvedValue({ count: 0 }); const data = new FormData(); data.set("id", "other-invite");
    await expect(revokeSystemInviteAction(data)).rejects.toThrow("unavailable"); expect(mocks.cancel).not.toHaveBeenCalled(); expect(mocks.cancelReminder).not.toHaveBeenCalled();
  });
});
