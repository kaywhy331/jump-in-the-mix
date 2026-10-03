import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireWorkspace: vi.fn(), create: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: mocks.requireWorkspace }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.rate }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: "127.0.0.1" }) }));
vi.mock("@/lib/support-service", () => ({ createSupportTicketRecord: mocks.create, SupportTicketError: class extends Error {} }));
vi.mock("@/lib/support-case-access", () => ({ SupportAccessError: class extends Error {} }));
vi.mock("@/lib/form-errors", () => ({ captureFormFailure: () => {}, withViewerError: (_path: string, message: string) => message, recoverableFormAction: (fn: () => unknown) => fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); } }));
import { formatSupportReport, supportReportBodyForSubmission } from "../src/lib/support-report";
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

describe("support saved-preview parity", () => {
  it.each([false, true])("matches the submitted multiline body at the cap (diagnostics %s)", async includeDiagnostics => {
    const raw = "a\n".repeat(20) + "x".repeat(4946) + "TAIL";
    expect(raw).toHaveLength(4990);
    const data = form({ body: raw, ...(includeDiagnostics ? { supportDiagnostics: context } : {}) });
    // Exercise real multipart encoding, without sending any request.
    const request = new Request("http://127.0.0.1/never-sent", { method: "POST", body: data });
    const submitted = await new Response(await request.arrayBuffer(), { headers: { "content-type": request.headers.get("content-type")! } }).formData();
    expect(submitted.get("body")).toHaveLength(5010);
    const preview = formatSupportReport({ title: "Could not save", body: supportReportBodyForSubmission(raw), diagnostics: includeDiagnostics ? context : "" });
    await expect(createSupportTicketAction(submitted)).rejects.toThrow("/account/tickets/ticket?created=1");
    const attachment = includeDiagnostics ? "\n\nIncluded context: Contacts; phone layout; Safari; light theme; online" : "";
    const expectedBody = "a\r\n".repeat(20) + "x".repeat(5000 - 60 - attachment.length) + attachment;
    expect(mocks.create.mock.calls[0][0].body).toBe(expectedBody);
    expect(preview.body).toBe(expectedBody);
    expect(preview.body).toHaveLength(5000);
    expect(preview.bodyShortened).toBe(true);
    expect(preview.body).not.toContain("TAIL");
    expect(raw).toHaveLength(4990);
    expect(raw.endsWith("TAIL")).toBe(true);
  });
  it.each([
    { title: "a@b.co ".repeat(20) + "TAIL", body: "a@b.co ".repeat(650) + "TAIL" },
    { body: "a@b.co ".repeat(650) + "TAIL", supportDiagnostics: context },
    { title: "  " + "x".repeat(161), body: "  " + "x".repeat(5001), supportContext: "Today; phone layout" },
    { body: "Detailed description with password=synthetic-secret", supportDiagnostics: "invalid", supportContext: "Today; phone layout" },
    { body: "Detailed description", supportDiagnostics: "invalid", supportContext: "private details" }
  ] as Record<string, string>[])("wires the final formatter into the saved payload for %j", async fields => {
    const data = form(fields);
    const expected = formatSupportReport({ title: String(data.get("title")), body: String(data.get("body")), diagnostics: String(data.get("supportDiagnostics") ?? ""), context: String(data.get("supportContext") ?? "") });
    await expect(createSupportTicketAction(data)).rejects.toThrow("/account/tickets/ticket?created=1");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ title: expected.title, body: expected.body, workspaceId: "own-workspace", requesterUserId: "own-user" });
    expect(expected.title.length).toBeLessThanOrEqual(160);
    expect(expected.body.length).toBeLessThanOrEqual(5000);
    expect(expected.title + expected.body).not.toMatch(/a@b\.co|synthetic-secret|private details/);
  });

  it("keeps minimum description and title validation independent of diagnostics", async () => {
    await expect(createSupportTicketAction(form({ body: "123456", supportDiagnostics: context }))).rejects.toThrow("Add at least 10 characters");
    await expect(createSupportTicketAction(form({ title: "four", supportDiagnostics: context }))).rejects.toThrow("at least 5 characters");
    expect(mocks.create).not.toHaveBeenCalled();
    // Preserve the current accepted contract: a short raw email expands before length validation.
    await expect(createSupportTicketAction(form({ title: "a@b.co", body: "a@b.co" }))).rejects.toThrow("/account/tickets/ticket?created=1");
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ title: "[email removed]", body: "[email removed]" });
  });
});
