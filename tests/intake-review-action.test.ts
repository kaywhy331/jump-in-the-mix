import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), resolve: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: mocks.workspace }));
vi.mock("@/lib/intake", () => ({ resolveIntake: mocks.resolve, IntakeError: class extends Error {} }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`); } }));
import { reviewIntakeAction } from "@/lib/intake-actions";

describe("receipt resolution presentation boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.workspace.mockResolvedValue({ workspace: { id: "own-workspace" }, user: { id: "owner" }, session: {} }); });
  const data = (returnTo = "/contacts/review") => { const form = new FormData(); form.set("receiptId", "receipt-only"); form.set("decision", "ignore"); form.set("returnTo", returnTo); form.set("workspaceId", "foreign-workspace"); return form; };
  it("refreshes every daily and settings count, preserving receipt/session identity", async () => {
    await expect(reviewIntakeAction(data())).rejects.toThrow("redirect:/contacts/review?saved=1#needs-review");
    expect(mocks.resolve).toHaveBeenCalledWith("own-workspace", "receipt-only", "ignore", "", "owner");
    expect(mocks.revalidate.mock.calls.map(call => call[0])).toEqual(["/jumps", "/contacts", "/contacts/review", "/settings/connections"]);
  });
  it("keeps the existing settings return and rejects arbitrary destinations", async () => {
    await expect(reviewIntakeAction(data("https://example.test/escape"))).rejects.toThrow("redirect:/settings/connections?saved=1#needs-review");
  });
  it("refuses view-only resolution before any mutation or cache change", async () => {
    mocks.workspace.mockResolvedValue({ workspace: { id: "own-workspace" }, user: { id: "owner" }, session: {}, impersonation: { id: "view" } });
    await expect(reviewIntakeAction(data())).rejects.toThrow("Support sessions are view-only.");
    expect(mocks.resolve).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
