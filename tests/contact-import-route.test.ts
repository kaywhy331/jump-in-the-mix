import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContactImportInputError } from "../src/lib/contact-import-errors";

const mocks = vi.hoisted(() => ({ commit: vi.fn(), queue: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentSession: async () => ({ authUser: { id: "owner" }, user: { id: "owner", memberships: [{ workspaceId: "workspace" }] } }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { dateType: { findMany: async () => [] } } }));
vi.mock("@/lib/display-preferences", () => ({ timezoneForUser: async () => "UTC" }));
vi.mock("@/lib/group-activity", () => ({ activeGroupIdsForWorkspace: async () => [] }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: "127.0.0.1" }) }));
vi.mock("@/lib/contact-import-jobs", () => ({ queueContactImportBatch: mocks.queue, getContactImportBatch: vi.fn(), listRecentContactImportBatches: vi.fn(), cancelContactImportBatch: vi.fn() }));
vi.mock("@/lib/contact-import-service", () => ({ commitContactImportBatch: mocks.commit, findImportMatches: vi.fn() }));
import { POST } from "../src/app/api/contacts/import/route";

async function post(request: Request) {
  const response = await POST(request);
  if (!response) throw new Error("The import handler returned no response.");
  return response;
}

function request(mode: "commit" | "queue", extra: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/contacts/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    mode, importId: "safe-import-id", items: [{ record: { rowId: "row", sourceRow: 2, source: "CSV", firstName: null, lastName: null, displayName: "Customer", company: null, publicNotes: null, emails: [], phones: [], addresses: [], groupIds: [], customFields: [], jumpDates: [] }, resolution: { rowId: "row", action: "CREATE", targetContactId: null } }], ...extra
  }) });
}
beforeEach(() => { vi.resetAllMocks(); });
describe("import HTTP failure boundary", () => {
  it.each(["commit", "queue"] as const)("keeps database and customer contents out of a failed %s response", async mode => {
    const failure = new Error("postgresql://private:credential@database/customer imported-private-notes");
    (mode === "commit" ? mocks.commit : mocks.queue).mockRejectedValueOnce(failure);
    const response = await post(request(mode));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("saved results"); expect(body).not.toContain("credential"); expect(body).not.toContain("imported-private-notes"); expect(body).not.toContain("postgresql");
  });
  it("preserves an actionable message for a known input error", async () => {
    mocks.queue.mockRejectedValueOnce(new ContactImportInputError("Each import row needs its own matching identifier."));
    const response = await post(request("queue"));
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ error: "Each import row needs its own matching identifier." });
  });
  it("does not accept a caller-supplied worker lease", async () => {
    const response = await post(request("commit", { background: { batchId: "batch", jobId: "job", leaseId: "lease" } }));
    expect(response.status).toBe(400); expect(mocks.commit).not.toHaveBeenCalled(); expect(mocks.queue).not.toHaveBeenCalled();
  });
});
