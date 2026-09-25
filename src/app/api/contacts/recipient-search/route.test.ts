import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({ prisma: { contact: { findMany: mocks.findMany } } }));
import { GET } from "./route";

type WhereInput = { AND: Array<{ OR: unknown[] }> };

async function search(q: string): Promise<WhereInput> {
  const response = await GET(new Request(`http://localhost/api/contacts/recipient-search?q=${encodeURIComponent(q)}`));
  expect(response.status).toBe(200);
  return mocks.findMany.mock.calls[0][0].where as WhereInput;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "owner", memberships: [{ workspaceId: "workspace" }] } });
  mocks.findMany.mockResolvedValue([]);
});

describe("recipient search by phone digits", () => {
  it("matches the stored digits however the number was typed", async () => {
    const where = await search("555-234-5678");
    expect(where.AND[1].OR).toEqual(expect.arrayContaining([
      { phones: { some: { phone: { contains: "555-234-5678" } } } },
      { phones: { some: { normalized: { contains: "5552345678" } } } },
      { phones: { some: { normalized: { contains: "15552345678" } } } }
    ]));
  });

  it("also tries the ten-digit form of an eleven-digit number starting with 1", async () => {
    const where = await search("+1 (555) 234-5678");
    expect(where.AND[1].OR).toEqual(expect.arrayContaining([
      { phones: { some: { normalized: { contains: "15552345678" } } } },
      { phones: { some: { normalized: { contains: "5552345678" } } } }
    ]));
  });

  it("needs at least four digits before searching the stored digits", async () => {
    const where = await search("Bob 123");
    expect(where.AND[1].OR).toHaveLength(3);
    expect(JSON.stringify(where)).not.toContain("normalized");
  });

  it("keeps the workspace scope and the sign-in requirement", async () => {
    const where = await search("4567");
    expect(mocks.findMany.mock.calls[0][0].where).toMatchObject({ workspaceId: "workspace", archivedAt: null });
    expect(where.AND[1].OR).toContainEqual({ phones: { some: { normalized: { contains: "4567" } } } });
    mocks.session.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/contacts/recipient-search?q=4567"));
    expect(response.status).toBe(401);
  });
});
