import { beforeEach, describe, expect, it, vi } from "vitest";
import { browserScope } from "../src/lib/browser-scope";
const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentSession: mocks.session }));
vi.mock("@/lib/env", () => ({ env: { requireEmailVerification: true } }));
import { GET } from "../src/app/api/auth/browser-context/route";
const session = () => ({ authUser: { id: "actor" }, user: { id: "owner", emailVerifiedAt: new Date(), memberships: [{ workspaceId: "workspace" }] }, impersonation: null });
beforeEach(() => { vi.clearAllMocks(); mocks.session.mockResolvedValue(session()); });
describe("browser context", () => {
  it("returns only an opaque, uncached scope derived from authenticated identity", async () => {
    const response = await GET(); expect(response.headers.get("Cache-Control")).toBe("private, no-store"); expect(response.headers.get("Vary")).toBe("Cookie");
    expect(await response.json()).toEqual({ scope: browserScope(session()) });
  });
  it("keeps same-account storage stable while separating actors, workspaces and support grants", () => {
    const identity = session(), original = browserScope(identity);
    expect(browserScope({ ...identity })).toBe(original);
    expect(browserScope({ ...identity, authUser: { id: "different-actor" } })).not.toBe(original);
    expect(browserScope({ ...identity, user: { ...identity.user, id: "different-user" } })).not.toBe(original);
    expect(browserScope({ ...identity, user: { ...identity.user, memberships: [{ workspaceId: "other" }] } })).not.toBe(original);
    expect(browserScope({ ...identity, impersonation: { id: "grant" } })).not.toBe(original);
    expect(browserScope({ ...identity, user: { ...identity.user, memberships: [] } })).toBeNull();
  });
  it("does not expose a scope for signed-out or unverified accounts", async () => {
    mocks.session.mockResolvedValue(null); expect(await (await GET()).json()).toEqual({ scope: null });
    const identity = session(); mocks.session.mockResolvedValue({ ...identity, user: { ...identity.user, emailVerifiedAt: null } });
    expect(await (await GET()).json()).toEqual({ scope: null });
  });
});
