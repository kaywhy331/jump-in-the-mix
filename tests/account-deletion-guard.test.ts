import { beforeEach, describe, expect, it, vi } from "vitest";

// The last active staff owner is refused inside the transaction: the refusal must be a typed error
// and the audit row must not stay STARTED (audit F11, 2026-09-24).
const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(async () => 0),
    staffInvitation: { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({ count: 0 })), deleteMany: vi.fn(async () => ({ count: 0 })) },
    waitlistDelivery: { updateMany: vi.fn(async () => ({ count: 0 })) },
    staffMembership: { findUnique: vi.fn(), count: vi.fn() },
    workspace: { deleteMany: vi.fn() },
    user: { delete: vi.fn() }
  };
  return {
    tx,
    prisma: {
      user: { findUnique: vi.fn() },
      accountDeletionAudit: { upsert: vi.fn(async () => ({})), update: vi.fn(async () => ({})) },
      $transaction: vi.fn(async (run: (client: typeof tx) => Promise<void>) => run(tx))
    }
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/staff-access", () => ({ lockStaff: async () => undefined }));
import { AccountDeletionBlockedError, LAST_ACTIVE_OWNER_MESSAGE, deleteAccountData } from "../src/lib/account-deletion";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.user.findUnique.mockResolvedValue({ email: "owner@example.test", ownedWorkspaces: [{ id: "workspace-1" }] });
  mocks.tx.staffMembership.findUnique.mockResolvedValue({ role: "OWNER", status: "ACTIVE" });
  mocks.tx.staffMembership.count.mockResolvedValue(1);
});

describe("last active owner guard", () => {
  it("refuses with a typed error, marks the audit row FAILED and deletes nothing", async () => {
    const attempt = deleteAccountData("user-1", "request-1");
    await expect(attempt).rejects.toBeInstanceOf(AccountDeletionBlockedError);
    await expect(attempt).rejects.toThrow(LAST_ACTIVE_OWNER_MESSAGE);
    expect(mocks.prisma.accountDeletionAudit.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ requestId: "request-1", status: "STARTED" }) }));
    expect(mocks.prisma.accountDeletionAudit.update).toHaveBeenCalledWith({
      where: { requestId: "request-1" },
      data: { status: "FAILED", metadata: { ownedWorkspaceCount: 1, reason: "blocked" } }
    });
    expect(mocks.tx.workspace.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.user.delete).not.toHaveBeenCalled();
  });

  it("still surfaces the refusal when the audit row cannot be updated", async () => {
    mocks.prisma.accountDeletionAudit.update.mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(deleteAccountData("user-1", "request-2")).rejects.toThrow(LAST_ACTIVE_OWNER_MESSAGE);
  });

  it("records other transaction failures as FAILED without disguising them", async () => {
    mocks.tx.staffMembership.count.mockRejectedValueOnce(new Error("connection reset"));
    await expect(deleteAccountData("user-1", "request-3")).rejects.toThrow("connection reset");
    expect(mocks.prisma.accountDeletionAudit.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", metadata: expect.objectContaining({ reason: "error" }) }) }));
  });
});
