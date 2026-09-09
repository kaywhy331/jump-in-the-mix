import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), contact: vi.fn(), read: vi.fn(), retry: vi.fn(), rate: vi.fn(), wake: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentSession: mocks.session }));
vi.mock("@/lib/env", () => ({ env: { requireEmailVerification: true } }));
vi.mock("@/lib/prisma", () => ({ prisma: { contact: { findFirst: mocks.contact } } }));
vi.mock("@/lib/preparation", () => ({ readPreparationStatus: mocks.read, retryPreparation: mocks.retry }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.rate }));
vi.mock("@/lib/worker-dispatch-after", () => ({ wakeWorkerAfterResponse: mocks.wake }));
import { GET, POST } from "../src/app/api/follow-ups/preparation/route";
const request = (query = "") => new Request(`https://example.test/api/follow-ups/preparation${query}`);
const session = (extra = {}) => ({ user: { id: "owner", emailVerifiedAt: new Date(), memberships: [{ workspaceId: "business" }] }, impersonation: null, ...extra });
beforeEach(() => {
  vi.clearAllMocks(); mocks.session.mockResolvedValue(session()); mocks.contact.mockResolvedValue({ id: "person" });
  mocks.read.mockResolvedValue({ state: "preparing", observedAt: new Date().toISOString() }); mocks.rate.mockResolvedValue({ allowed: true });
});
describe("preparation endpoint boundaries", () => {
  it("returns scoped, uncached status and wakes the authorized business", async () => {
    const response = await GET(request("?contactId=person&workspaceId=foreign"));
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.read).toHaveBeenCalledWith("business", "person");
    expect(mocks.contact).toHaveBeenCalledWith({ where: { id: "person", workspaceId: "business", archivedAt: null }, select: { id: true } });
    expect(mocks.wake).toHaveBeenCalledWith("business");
  });
  it("returns JSON 401 for expired sessions and rejects unverified accounts", async () => {
    mocks.session.mockResolvedValue(null);
    const response = await GET(request()); expect(response.status).toBe(401); expect(await response.json()).toHaveProperty("error");
    mocks.session.mockResolvedValue(session({ user: { emailVerifiedAt: null, memberships: [{ workspaceId: "business" }] } }));
    expect((await POST(request())).status).toBe(403); expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.retry).not.toHaveBeenCalled();
  });
  it("rejects missing, archived, foreign and malformed contacts before reading jobs", async () => {
    mocks.contact.mockResolvedValue(null);
    expect((await GET(request("?contactId=foreign"))).status).toBe(404);
    expect((await POST(request("?contactId=foreign"))).status).toBe(404);
    expect((await GET(request("?contactId="))).status).toBe(400);
    expect((await GET(request(`?contactId=${"a".repeat(129)}`))).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.retry).not.toHaveBeenCalled();
  });
  it("keeps support sessions read-only and suppresses wakeups", async () => {
    mocks.session.mockResolvedValue(session({ impersonation: {} }));
    expect((await GET(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(403);
    expect(mocks.retry).not.toHaveBeenCalled(); expect(mocks.wake).not.toHaveBeenCalled();
  });
  it("limits retry attempts per business and preserves retry-after", async () => {
    mocks.rate.mockResolvedValue({ allowed: false, retryAfterSeconds: 120 });
    const response = await POST(request()); expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("120");
    expect(mocks.retry).not.toHaveBeenCalled();
    expect(mocks.rate).toHaveBeenCalledWith(expect.objectContaining({ identifiers: ["business"] }));
  });
  it("retries only the authorized business and returns the requested contact status", async () => {
    expect((await POST(request("?contactId=person"))).status).toBe(200);
    expect(mocks.retry).toHaveBeenCalledWith("business", "owner"); expect(mocks.read).toHaveBeenCalledWith("business", "person");
    expect(mocks.wake).toHaveBeenCalledWith("business");
  });
});
