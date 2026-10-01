import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The form action keeps a refusal the person can act on in the form's error slot (audit F11).
const mocks = vi.hoisted(() => ({ requireWorkspace: vi.fn(), destroySession: vi.fn(), consumeRateLimit: vi.fn(), deleteAccountData: vi.fn(), assertNotLastActiveOwner: vi.fn(), closeBillingForDeletion: vi.fn() }));
vi.mock("@/lib/billing-deletion", () => ({ closeBillingForDeletion: mocks.closeBillingForDeletion }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: mocks.requireWorkspace, destroySession: mocks.destroySession }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.consumeRateLimit }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/staff-access", () => ({ lockStaff: async () => undefined }));
vi.mock("@/lib/account-deletion", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/account-deletion")>()), deleteAccountData: mocks.deleteAccountData, assertNotLastActiveOwner: mocks.assertNotLastActiveOwner }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
import { AccountDeletionBlockedError, LAST_ACTIVE_OWNER_MESSAGE } from "../src/lib/account-deletion";
import { deleteAccountAction } from "../src/lib/account-deletion-actions";
import { ACCOUNT_DELETION_PHRASE } from "../src/lib/account-deletion-policy";

const password = "correct horse battery";
const passwordHash = bcrypt.hashSync(password, 4);

function submission(currentPassword = password, confirmation = ACCOUNT_DELETION_PHRASE) {
  const form = new FormData();
  form.set("currentPassword", currentPassword);
  form.set("confirmation", confirmation);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireWorkspace.mockResolvedValue({ user: { id: "user-1", passwordHash }, session: { createdAt: new Date() }, workspace: { id: "workspace-1" }, impersonation: null });
  mocks.assertNotLastActiveOwner.mockResolvedValue(undefined);
  mocks.closeBillingForDeletion.mockResolvedValue(undefined);
  mocks.consumeRateLimit.mockResolvedValue({ allowed: true });
  mocks.deleteAccountData.mockResolvedValue({ deleted: true, requestId: "request-1" });
});

describe("deleteAccountAction", () => {
  it("returns the last-owner refusal to the form instead of failing the request", async () => {
    mocks.deleteAccountData.mockRejectedValueOnce(new AccountDeletionBlockedError(LAST_ACTIVE_OWNER_MESSAGE));
    await expect(deleteAccountAction({ error: null }, submission())).resolves.toEqual({ error: "Add another active owner before deleting your account." });
    expect(mocks.deleteAccountData).toHaveBeenCalledWith("user-1");
  });

  it("sends the person to the deleted page after a successful deletion", async () => {
    await expect(deleteAccountAction({ error: null }, submission())).rejects.toThrow("REDIRECT /account/deleted");
    // Billing follows the person's owned workspaces, never the workspace the session happens to open (BIL-01).
    expect(mocks.closeBillingForDeletion).toHaveBeenCalledWith("user-1");
    expect(mocks.closeBillingForDeletion.mock.invocationCallOrder[0]).toBeLessThan(mocks.deleteAccountData.mock.invocationCallOrder[0]);
  });

  it("refuses the last active owner before any paid plan is closed", async () => {
    mocks.assertNotLastActiveOwner.mockRejectedValueOnce(new AccountDeletionBlockedError(LAST_ACTIVE_OWNER_MESSAGE));
    await expect(deleteAccountAction({ error: null }, submission())).resolves.toEqual({ error: LAST_ACTIVE_OWNER_MESSAGE });
    expect(mocks.closeBillingForDeletion).not.toHaveBeenCalled();
    expect(mocks.deleteAccountData).not.toHaveBeenCalled();
  });

  it("deletes nothing when a paid plan can't be closed with Stripe", async () => {
    mocks.closeBillingForDeletion.mockRejectedValueOnce(new AccountDeletionBlockedError("Your paid plan couldn’t be closed with the payment provider, so nothing was deleted."));
    await expect(deleteAccountAction({ error: null }, submission())).resolves.toEqual({ error: "Your paid plan couldn’t be closed with the payment provider, so nothing was deleted." });
    expect(mocks.deleteAccountData).not.toHaveBeenCalled();
  });

  it("does not disguise unexpected failures as a form message", async () => {
    mocks.deleteAccountData.mockRejectedValueOnce(new Error("connection reset"));
    await expect(deleteAccountAction({ error: null }, submission())).rejects.toThrow("connection reset");
  });

  it("still checks the phrase and password before touching any data", async () => {
    await expect(deleteAccountAction({ error: null }, submission("wrong"))).resolves.toEqual({ error: "The current password is incorrect." });
    await expect(deleteAccountAction({ error: null }, submission(password, "delete my account"))).resolves.toEqual({ error: `Type ${ACCOUNT_DELETION_PHRASE} exactly to continue.` });
    expect(mocks.deleteAccountData).not.toHaveBeenCalled();
    expect(mocks.closeBillingForDeletion).not.toHaveBeenCalled();
    expect(mocks.assertNotLastActiveOwner).not.toHaveBeenCalled();
  });
});
