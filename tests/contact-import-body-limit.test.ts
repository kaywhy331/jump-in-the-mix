import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ matches: vi.fn(), queue: vi.fn(), commit: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentSession: async () => ({ authUser: { id: "owner" }, user: { id: "owner", memberships: [{ workspaceId: "workspace" }] }, impersonation: null }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { dateType: { findMany: async () => [] } } }));
vi.mock("@/lib/display-preferences", () => ({ timezoneForUser: async () => "UTC" }));
vi.mock("@/lib/group-activity", () => ({ activeGroupIdsForWorkspace: async () => [] }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true, remaining: 100, retryAfterSeconds: 0 }) }));
vi.mock("@/lib/request-context", () => ({ getRequestMetadata: async () => ({ ipAddress: "127.0.0.1" }) }));
vi.mock("@/lib/contact-import-jobs", () => ({ queueContactImportBatch: mocks.queue, getContactImportBatch: vi.fn(), listRecentContactImportBatches: vi.fn(), cancelContactImportBatch: vi.fn() }));
vi.mock("@/lib/contact-import-service", () => ({ commitContactImportBatch: mocks.commit, findImportMatches: mocks.matches }));
import { POST } from "../src/app/api/contacts/import/route";

const MEGABYTE = 1024 * 1024;
const CAP = 12 * MEGABYTE;
const record = { rowId: "row-1", sourceRow: 2, source: "CSV", firstName: "Robin", lastName: "Import", displayName: "Robin Import", company: null, publicNotes: null, emails: [{ value: "robin@example.test", label: null, isPrimary: true }], phones: [], addresses: [], groupIds: [], customFields: [], jumpDates: [] };

/** A browser or script upload sent in chunks: no Content-Length, produced only as it is read. */
function chunkedUpload(chunks: Uint8Array[] | ((index: number) => Uint8Array | null), headers: Record<string, string> = {}) {
  const read = { chunks: 0 };
  const next = typeof chunks === "function" ? chunks : (index: number) => chunks[index] ?? null;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = next(read.chunks);
      if (!chunk) { controller.close(); return; }
      read.chunks += 1;
      controller.enqueue(chunk);
    }
  }, { highWaterMark: 0 });
  const init: RequestInit & { duplex: "half" } = { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body, duplex: "half" };
  return { request: new Request("http://localhost/api/contacts/import", init), read };
}

async function post(request: Request) {
  const response = await POST(request);
  if (!response) throw new Error("The import handler returned no response.");
  return response;
}

beforeEach(() => { vi.resetAllMocks(); });

describe("contact import request size", () => {
  it("answers 413 for a chunked body over 12 MB without Content-Length, and stops reading at the cap", async () => {
    const { request, read } = chunkedUpload((index) => index < 64 ? new Uint8Array(MEGABYTE).fill(0x20) : null);
    expect(request.headers.get("content-length")).toBeNull();
    const response = await post(request);
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "The import request is too large. Split the file into smaller batches." });
    expect(read.chunks).toBeGreaterThan(CAP / MEGABYTE);
    expect(read.chunks).toBeLessThanOrEqual(CAP / MEGABYTE + 2);
    expect(mocks.matches).not.toHaveBeenCalled();
  });

  it("still refuses a declared Content-Length over the cap before reading", async () => {
    const { request, read } = chunkedUpload([new TextEncoder().encode("{}")], { "Content-Length": String(CAP + 1) });
    const response = await post(request);
    expect(response.status).toBe(413);
    expect(read.chunks).toBe(0);
  });

  it("parses a normal chunked body", async () => {
    mocks.matches.mockResolvedValueOnce({ matches: [] });
    const payload = new TextEncoder().encode(JSON.stringify({ mode: "match", records: [record] }));
    const { request } = chunkedUpload([payload.slice(0, 40), payload.slice(40, 90), payload.slice(90)]);
    const response = await post(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ matches: [] });
    expect(mocks.matches).toHaveBeenCalledExactlyOnceWith("workspace", [record]);
  });

  it("parses a normal body with Content-Length, and rejects text that is not JSON", async () => {
    mocks.matches.mockResolvedValueOnce({ matches: [] });
    const ok = await post(new Request("http://localhost/api/contacts/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "match", records: [record] }) }));
    expect(ok.status).toBe(200);
    const invalid = await post(new Request("http://localhost/api/contacts/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{ not json" }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: "The import payload is invalid." });
    expect(mocks.matches).toHaveBeenCalledTimes(1);
  });
});
