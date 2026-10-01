import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireWorkspace: vi.fn(), create: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: mocks.requireWorkspace }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.rate }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: "127.0.0.1" }) }));
vi.mock("@/lib/support-service", () => ({ createSupportTicketRecord: mocks.create, SupportTicketError: class extends Error {} }));
vi.mock("@/lib/support-case-access", () => ({ SupportAccessError: class extends Error {} }));
vi.mock("@/lib/form-errors", () => ({ captureFormFailure: () => {}, withViewerError: (_path: string, message: string) => message, recoverableFormAction: (fn: () => unknown) => fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); } }));
import { createSupportTicketAction } from "../src/lib/support-actions";
const context = JSON.stringify({ section: "Contacts", layout: "phone", browser: "Safari", theme: "light", connection: "online" });
function form(fields: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ title: "Could not save", body: "The save button did not respond.", category: "BUG", ...fields })) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireWorkspace.mockResolvedValue({ workspace: { id: "own-workspace" }, user: { id: "own-user" }, session: {}, impersonation: null });
  mocks.rate.mockResolvedValue({ allowed: true });
  mocks.create.mockResolvedValue({ id: "ticket" });
});
describe("new feedback action", () => {
  it("does not let diagnostics replace the actual description", async () => {
    await expect(createSupportTicketAction(form({ body: "", supportDiagnostics: context, supportContext: "Today; phone layout" }))).rejects.toThrow("Add at least 10 characters");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("redacts before saving and uses only session ownership", async () => {
    await expect(createSupportTicketAction(form({ title: "Problem for person@example.test", body: "Cannot save +1 (202) 555-0147 with password=secretvalue", supportDiagnostics: context, workspaceId: "other", requesterUserId: "other" }))).rejects.toThrow("/account/tickets/ticket?created=1");
    const saved = mocks.create.mock.calls[0][0];
    expect(saved.workspaceId).toBe("own-workspace");
    expect(saved.requesterUserId).toBe("own-user");
    expect(saved.title + saved.body).not.toMatch(/person@|555|secretvalue/);
    expect(saved.body).toContain("Included context: Contacts; phone layout; Safari; light theme; online");
  });
  it("includes no diagnostics unless submitted and preserves the report length bound", async () => {
    await expect(createSupportTicketAction(form())).rejects.toThrow("/account/tickets/ticket");
    expect(mocks.create.mock.calls[0][0].body).toBe("The save button did not respond.");
    await expect(createSupportTicketAction(form({ body: "x".repeat(5000), supportDiagnostics: context }))).rejects.toThrow("/account/tickets/ticket");
    expect(mocks.create.mock.calls[1][0].body.length).toBeLessThanOrEqual(5000);
  });
  it("retains the view-only and rate-limit boundaries", async () => {
    mocks.requireWorkspace.mockResolvedValueOnce({ workspace: { id: "own" }, user: { id: "own" }, session: {}, impersonation: {} });
    await expect(createSupportTicketAction(form())).rejects.toThrow("view-only");
    mocks.rate.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 60 });
    await expect(createSupportTicketAction(form())).rejects.toThrow("Too many support tickets");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
