import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rate: vi.fn(), allocate: vi.fn(), update: vi.fn(), delivery: vi.fn(), cancel: vi.fn(), configured: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: mocks.auth }));
vi.mock("@/lib/env", () => ({ env: { pilotMode: false, appUrl: "https://example.com" } }));
vi.mock("@/lib/integration-crypto", () => ({ integrationEncryptionConfigured: () => true }));
vi.mock("@/lib/referral-access", () => ({ AccessInviteError: class extends Error {}, allocateAccessInvite: mocks.allocate }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  $transaction: (fn: any) => fn({ $executeRaw: vi.fn(), referralAccessInvite: { updateMany: mocks.update }, waitlistDelivery: { updateMany: mocks.cancel } }),
  waitlistDelivery: { findUnique: mocks.delivery }
} }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.rate }));
vi.mock("@/lib/transactional-email", () => ({ transactionalEmailConfigured: mocks.configured }));
import { sendSystemInviteAction, revokeSystemInviteAction } from "../src/lib/system-mix-actions";
function form() { const data = new FormData(); data.set("systemMixVersion", "1"); data.set("previewSender", "Owner"); data.set("previewContact", "Contact"); data.set("recipient", JSON.stringify({ contactId: "contact", email: "contact@example.com" })); return data; }
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "owner", name: "Owner", emailVerifiedAt: new Date() }, workspace: { id: "workspace" }, impersonation: null });
  mocks.rate.mockResolvedValue({ allowed: true }); mocks.configured.mockReturnValue(true);
  mocks.allocate.mockResolvedValue({ id: "invite", acceptedAt: null, revokedAt: null });
  mocks.delivery.mockResolvedValue({ status: "QUEUED" }); mocks.update.mockResolvedValue({ count: 1 });
});
describe("System Mix sends within the application", () => {
  it("queues through the authenticated contact flow and does not return a URL or claim delivery", async () => {
    await expect(sendSystemInviteAction(form())).rejects.toThrow("REDIRECT /mixes/system?queued=1");
    expect(mocks.allocate).toHaveBeenCalledWith(expect.anything(), { userId: "owner", workspaceId: "workspace", contactId: "contact", recipientEmail: "contact@example.com", expectedVersion: 1, expectedSender: "Owner", expectedContact: "Contact" });
  });
  it("recognizes an already accepted provider send", async () => {
    mocks.delivery.mockResolvedValue({ status: "SENT" });
    await expect(sendSystemInviteAction(form())).rejects.toThrow("sent=1");
  });
  it.each([null, { status: "REVIEW" }, { status: "CANCELED" }])("requires delivery review for uncertain or legacy sends", async delivery => {
    mocks.delivery.mockResolvedValue(delivery);
    await expect(sendSystemInviteAction(form())).rejects.toThrow("review");
  });
  it("blocks impersonation", async () => {
    mocks.auth.mockResolvedValue({ user: {}, workspace: {}, impersonation: {} });
    await expect(sendSystemInviteAction(form())).rejects.toThrow("view-only");
    expect(mocks.allocate).not.toHaveBeenCalled();
  });
  it("blocks unauthorized access", async () => {
    mocks.auth.mockRejectedValue(new Error("Sign in required"));
    await expect(sendSystemInviteAction(form())).rejects.toThrow("Sign in required");
    expect(mocks.allocate).not.toHaveBeenCalled();
  });
  it("does not allocate when email is unavailable", async () => {
    mocks.configured.mockReturnValue(false);
    await expect(sendSystemInviteAction(form())).rejects.toThrow("temporarily%20unavailable");
    expect(mocks.allocate).not.toHaveBeenCalled();
  });
  it("rate limits sending", async () => {
    mocks.rate.mockResolvedValue({ allowed: false });
    await expect(sendSystemInviteAction(form())).rejects.toThrow("Too%20many");
    expect(mocks.allocate).not.toHaveBeenCalled();
  });
  it("rejects malformed contact selection", async () => {
    await expect(sendSystemInviteAction(new FormData())).rejects.toThrow("Choose%20a%20contact");
    expect(mocks.allocate).not.toHaveBeenCalled();
  });
  it("cannot send a revoked invitation", async () => {
    mocks.allocate.mockResolvedValue({ acceptedAt: null, revokedAt: new Date() });
    await expect(sendSystemInviteAction(form())).rejects.toThrow("revoked");
    expect(mocks.delivery).not.toHaveBeenCalled();
  });
  it("scopes revocation to the signed-in owner and workspace and cancels the pending email", async () => {
    const data = new FormData(); data.set("id", "invite");
    await expect(revokeSystemInviteAction(data)).rejects.toThrow("revoked=1");
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "invite", inviterUserId: "owner", workspaceId: "workspace", acceptedAt: null, revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(mocks.cancel).toHaveBeenCalledWith(expect.objectContaining({ where: { inviteId: "invite", status: { in: ["QUEUED", "SENDING", "REVIEW"] } } }));
  });
  it("does not cancel another account's delivery", async () => {
    mocks.update.mockResolvedValue({ count: 0 });
    const data = new FormData(); data.set("id", "other-invite");
    await expect(revokeSystemInviteAction(data)).rejects.toThrow("unavailable");
    expect(mocks.cancel).not.toHaveBeenCalled();
  });
});
