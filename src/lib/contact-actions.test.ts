import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  emailConflict: vi.fn(),
  phoneConflict: vi.fn(),
  contactFindFirst: vi.fn(),
  memberships: vi.fn(),
  jobCreate: vi.fn(),
  tx: {
    contact: { update: vi.fn() },
    contactEmail: { upsert: vi.fn(), deleteMany: vi.fn() },
    contactPhone: { upsert: vi.fn(), deleteMany: vi.fn() },
    contactAddress: { findMany: vi.fn(), update: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    contactGroupMembership: { upsert: vi.fn(), deleteMany: vi.fn() },
    contactCustomFieldValue: { upsert: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn() }
  }
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: mocks.auth }));
vi.mock("@/lib/journey", () => ({ applyJourneyEvent: vi.fn() }));
vi.mock("@/lib/group-activity", () => ({ listGroupStates: async () => [], mergeGroupActivity: () => [] }));
vi.mock("@/lib/contact-custom-fields", () => ({ buildContactCustomFieldInputs: () => [], validateContactCustomFieldInputs: async () => undefined }));
vi.mock("@/lib/display-preferences", () => ({ timezoneForUser: async () => "UTC" }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  group: { findMany: async () => [] },
  contactGroupMembership: { findMany: mocks.memberships },
  contactEmail: { findFirst: mocks.emailConflict },
  contactPhone: { findFirst: mocks.phoneConflict },
  contact: { findFirst: mocks.contactFindFirst },
  job: { create: mocks.jobCreate },
  $transaction: (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx)
} }));
import { saveContactFormAction } from "@/lib/contact-actions";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "owner" }, workspace: { id: "workspace" }, impersonation: null });
  mocks.memberships.mockResolvedValue([]);
  mocks.emailConflict.mockResolvedValue(null);
  mocks.phoneConflict.mockResolvedValue(null);
  mocks.contactFindFirst.mockResolvedValue({ id: "contact_1" });
  mocks.tx.contactAddress.findMany.mockResolvedValue([]);
});

describe("contact form duplicate check", () => {
  it("names an archived owner of the phone and links to Archived contacts filtered by the typed value", async () => {
    mocks.phoneConflict.mockResolvedValue({ contact: { displayName: "Bob Smith", archivedAt: new Date("2025-01-01T00:00:00Z") } });
    const result = await saveContactFormAction({}, form({ firstName: "Bob", phoneValue: "+1 (555) 234-5678", phoneLabel: "Mobile" }));
    expect(result).toEqual({
      error: "That phone already belongs to Bob Smith (archived). Restore them from Archived contacts or use another number.",
      errorLink: { href: "/contacts/archived?q=%2B1%20(555)%20234-5678", label: "Open Archived contacts" }
    });
    expect(mocks.phoneConflict).toHaveBeenCalledWith({
      where: { normalized: "+15552345678", contact: { workspaceId: "workspace" } },
      select: { contact: { select: { displayName: true, archivedAt: true } } }
    });
    expect(JSON.stringify(mocks.phoneConflict.mock.calls[0][0].where)).not.toContain("archivedAt");
  });

  it("names an active owner of the email and points at Find duplicates", async () => {
    mocks.emailConflict.mockResolvedValue({ contact: { displayName: "Dana Reyes", archivedAt: null } });
    const result = await saveContactFormAction({}, form({ firstName: "Dana", emailValue: "dana@example.com" }));
    expect(result).toEqual({
      error: "That email already belongs to Dana Reyes. Use Find duplicates if these are the same person.",
      errorLink: { href: "/contacts/duplicates", label: "Find duplicates" }
    });
    expect(mocks.emailConflict).toHaveBeenCalledWith({
      where: { normalized: "dana@example.com", contact: { workspaceId: "workspace" } },
      select: { contact: { select: { displayName: true, archivedAt: true } } }
    });
  });

  it("excludes the contact being edited and keeps the archived wording on edits too", async () => {
    mocks.phoneConflict.mockResolvedValue({ contact: { displayName: "Old Bob", archivedAt: new Date("2025-01-01T00:00:00Z") } });
    const result = await saveContactFormAction({}, form({ contactId: "contact_1", firstName: "Bob", phoneValue: "(555) 234-5678" }));
    expect(result.error).toBe("That phone already belongs to Old Bob (archived). Restore them from Archived contacts or use another number.");
    expect(result.errorLink).toEqual({ href: "/contacts/archived?q=(555)%20234-5678", label: "Open Archived contacts" });
    expect(mocks.phoneConflict.mock.calls[0][0].where).toMatchObject({ contactId: { not: "contact_1" } });
    expect(mocks.tx.contact.update).not.toHaveBeenCalled();
  });

  it("keeps plain validation errors without a link", async () => {
    const result = await saveContactFormAction({}, form({ phoneValue: "12" }));
    expect(result).toEqual({ error: "Invalid phone number: 12" });
  });
});

describe("returning to Today after an edit", () => {
  it("appends contactSaved=1 to the validated Today return path", async () => {
    await expect(saveContactFormAction({}, form({ contactId: "contact_1", firstName: "Bob", phoneValue: "(555) 234-5678", returnTo: "/jumps?focus=jump_1" })))
      .rejects.toThrow("REDIRECT /jumps?focus=jump_1&contactSaved=1");
    expect(mocks.tx.contact.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "contact_1" } }));
    expect(mocks.jobCreate).toHaveBeenCalledWith({ data: { workspaceId: "workspace", task: "generate-jumps", payload: { contactId: "contact_1" } } });
  });

  it("keeps a fragment after the flag and ignores return paths that are not Today", async () => {
    await expect(saveContactFormAction({}, form({ contactId: "contact_1", firstName: "Bob", returnTo: "/jumps#review" })))
      .rejects.toThrow("REDIRECT /jumps?contactSaved=1#review");
    await expect(saveContactFormAction({}, form({ contactId: "contact_1", firstName: "Bob", returnTo: "https://evil.example/jumps" })))
      .rejects.toThrow("REDIRECT /contacts/contact_1?updated=1");
    await expect(saveContactFormAction({}, form({ contactId: "contact_1", firstName: "Bob", returnTo: "/contacts/other" })))
      .rejects.toThrow("REDIRECT /contacts/contact_1?updated=1");
  });
});
