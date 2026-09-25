import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  emailConflict: vi.fn(),
  phoneConflict: vi.fn(),
  contactFindFirst: vi.fn(),
  memberships: vi.fn(),
  jobCreate: vi.fn(),
  tx: {
    $queryRaw: vi.fn(),
    contact: { update: vi.fn(), findFirst: vi.fn() },
    contactEmail: { upsert: vi.fn(), deleteMany: vi.fn() },
    contactPhone: { upsert: vi.fn(), deleteMany: vi.fn(), update: vi.fn() },
    contactAddress: { findMany: vi.fn(), update: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    contactGroupMembership: { upsert: vi.fn(), deleteMany: vi.fn() },
    contactCustomFieldValue: { upsert: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn() }
  }
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: mocks.auth }));
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, env: { ...actual.env, authRateLimitSecret: "contact-actions-test-secret-0000001" } };
});
vi.mock("@/lib/journey", () => ({ applyJourneyEvent: vi.fn() }));
vi.mock("@/lib/group-activity", () => ({ listGroupStates: async () => [], mergeGroupActivity: () => [] }));
vi.mock("@/lib/contact-custom-fields", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/contact-custom-fields")>()), validateContactCustomFieldInputs: async () => undefined }));
vi.mock("@/lib/display-preferences", () => ({ timezoneForUser: async () => "UTC" }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  group: { findMany: async () => [] },
  contactGroupMembership: { findMany: mocks.memberships },
  contactEmail: { findFirst: mocks.emailConflict },
  contactPhone: { findFirst: mocks.phoneConflict },
  contact: { findFirst: mocks.contactFindFirst },
  job: { create: mocks.jobCreate },
  // No preference row: the workspace reads phone numbers as North American (US).
  workspacePreference: { findUnique: async () => null },
  $transaction: (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx)
} }));
import { createContactAction, saveContactFormAction, updateContactAction } from "@/lib/contact-actions";
import { STALE_CONTACT_SAVE, contactRevision } from "@/lib/contact-revision";
import { UNVERIFIED_ERROR_MESSAGE, viewerErrorMessage } from "@/lib/form-errors";
import { VIEW_ONLY_SUPPORT_MESSAGE } from "@/lib/writable-workspace";

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  return data;
}

/** The contact as the edit form showed it, and the fingerprint the form carries. */
const SHOWN = {
  firstName: "Bob", lastName: null, displayName: "Bob", company: null, publicNotes: null, privateNotes: null,
  emails: [], phones: [{ id: "phone_1", phone: "(555) 234-5678", normalized: "5552345678", label: null, isPrimary: true }],
  addresses: [], groupMemberships: [], customFieldValues: []
};
const REVISION = contactRevision(SHOWN);

const params = (location: string) => Object.fromEntries(new URL(location, "https://app.invalid").searchParams);
/** Where a redirecting action sent the browser (the mocked redirect throws it). */
const redirected = (action: Promise<unknown>) => action.then(() => "", (error: Error) => error.message.replace(/^REDIRECT /, ""));
const owner = { authUser: { id: "owner" } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ session: owner, user: { id: "owner" }, workspace: { id: "workspace" }, impersonation: null });
  mocks.memberships.mockResolvedValue([]);
  mocks.emailConflict.mockResolvedValue(null);
  mocks.phoneConflict.mockResolvedValue(null);
  mocks.contactFindFirst.mockResolvedValue({ id: "contact_1" });
  mocks.tx.contact.findFirst.mockResolvedValue(SHOWN);
  mocks.tx.contactAddress.findMany.mockResolvedValue([]);
});

describe("contact form duplicate check", () => {
  it("names an archived owner of the phone and links to Archived contacts filtered by the typed value", async () => {
    mocks.phoneConflict.mockResolvedValue({ contact: { displayName: "Bob Smith", archivedAt: new Date("2025-01-01T00:00:00Z") } });
    const result = await saveContactFormAction({}, form({ firstName: "Bob", phoneValue: "+1 (555) 234-5678", phoneLabel: "Mobile" }));
    expect(result).toEqual({
      error: "That phone already belongs to Bob Smith (archived). Restore them from Archived contacts or use another number.",
      errorLink: { href: "/contacts/archived?q=%2B1%20(555)%20234-5678", label: "Open Archived contacts" },
      field: "phoneValue:0"
    });
    // Both keys: the canonical one and the format-based one a row saved before the key change holds.
    expect(mocks.phoneConflict).toHaveBeenCalledWith({
      where: { normalized: { in: ["+15552345678"] }, contact: { workspaceId: "workspace" } },
      select: { contact: { select: { displayName: true, archivedAt: true } } }
    });
    expect(JSON.stringify(mocks.phoneConflict.mock.calls[0][0].where)).not.toContain("archivedAt");
  });

  it("names an active owner of the email and points at Find duplicates", async () => {
    mocks.emailConflict.mockResolvedValue({ contact: { displayName: "Dana Reyes", archivedAt: null } });
    const result = await saveContactFormAction({}, form({ firstName: "Dana", emailValue: "dana@example.com" }));
    expect(result).toEqual({
      error: "That email already belongs to Dana Reyes. Use Find duplicates if these are the same person.",
      errorLink: { href: "/contacts/duplicates", label: "Find duplicates" },
      field: "emailValue:0"
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
    expect(result).toEqual({ error: "Invalid phone number: 12", field: "phoneValue:0" });
  });
});

describe("contact form field errors", () => {
  it("names the submitted row of an invalid email or phone, counting blank rows", async () => {
    expect(await saveContactFormAction({}, form({ firstName: "Dana", emailValue: ["dana@example.com", "bob@@example"] })))
      .toEqual({ error: "Invalid email address: bob@@example", field: "emailValue:1" });
    expect(await saveContactFormAction({}, form({ contactId: "contact_1", revision: REVISION, firstName: "Bob", phoneValue: ["", "12", "34"] })))
      .toEqual({ error: "Invalid phone number: 12", field: "phoneValue:1" });
    expect(mocks.tx.contact.update).not.toHaveBeenCalled();
  });

  it("points a missing name at First name and a too-long custom value at its own field", async () => {
    expect(await saveContactFormAction({}, form({ firstName: "", lastName: "" })))
      .toEqual({ error: "Add a name, company, email, or phone number.", field: "firstName" });
    expect(await saveContactFormAction({}, form({ firstName: "Bob", customFieldDefinitionId: ["field_short", "field_long"], customFieldValue: ["fine", "x".repeat(2001)] })))
      .toEqual({ error: "Contact custom field values must be 2,000 characters or fewer.", field: "custom:field_long" });
  });

  it("names the row whose phone belongs to someone else, whatever punctuation was typed", async () => {
    mocks.phoneConflict.mockImplementation(async ({ where }: { where: { normalized: { in: string[] } } }) => where.normalized.in.includes("5552345678") ? { contact: { displayName: "Dana Reyes", archivedAt: null } } : null);
    const result = await saveContactFormAction({}, form({ firstName: "Bob", phoneValue: ["(555) 111-2222", "555.234.5678"] }));
    expect(result).toMatchObject({ error: "That phone already belongs to Dana Reyes. Use Find duplicates if these are the same person.", field: "phoneValue:1" });
  });
});

describe("saving an edit form that is out of date", () => {
  it("locks the person and refuses when what the form overwrites changed since it opened", async () => {
    mocks.tx.contact.findFirst.mockResolvedValue({ ...SHOWN, phones: [...SHOWN.phones, { phone: "555-0199", normalized: "5550199", label: "Work", isPrimary: false }] });
    const result = await saveContactFormAction({}, form({ contactId: "contact_1", revision: REVISION, firstName: "Robert", phoneValue: "(555) 234-5678" }));
    expect(result).toEqual({ error: STALE_CONTACT_SAVE });
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(String(mocks.tx.$queryRaw.mock.calls[0][0].join("?"))).toContain('FROM "Contact" WHERE id = ? AND "workspaceId" = ? FOR UPDATE');
    expect(mocks.tx.contact.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "contact_1", workspaceId: "workspace", archivedAt: null } }));
    expect(mocks.tx.contact.update).not.toHaveBeenCalled();
    expect(mocks.tx.contactPhone.deleteMany).not.toHaveBeenCalled();
    expect(mocks.jobCreate).not.toHaveBeenCalled();
  });

  it("treats a person archived meanwhile as out of date", async () => {
    mocks.tx.contact.findFirst.mockResolvedValue(null);
    expect(await saveContactFormAction({}, form({ contactId: "contact_1", revision: REVISION, firstName: "Bob" }))).toEqual({ error: STALE_CONTACT_SAVE });
    expect(await saveContactFormAction({}, form({ contactId: "contact_1", firstName: "Bob" }))).toEqual({ error: STALE_CONTACT_SAVE });
    expect(mocks.tx.contact.update).not.toHaveBeenCalled();
  });

  it("saves a form opened before fingerprints existed, as it did before the check", async () => {
    await expect(saveContactFormAction({}, form({ contactId: "contact_1", firstName: "Bob" }))).rejects.toThrow("REDIRECT /contacts/contact_1?updated=1");
    expect(mocks.tx.contact.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "contact_1" } }));
  });
});

describe("errors the save cannot explain", () => {
  it("show the fixed sentence instead of a database failure's own text", async () => {
    mocks.emailConflict.mockRejectedValue(new Error("Invalid `prisma.contactEmail.findFirst()` invocation: Can't reach database server at db.internal:5432"));
    expect(await saveContactFormAction({}, form({ firstName: "Dana", emailValue: "dana@example.com" }))).toEqual({ error: "The contact could not be saved." });
    expect(await saveContactFormAction({}, form({ contactId: "contact_1", revision: REVISION, firstName: "Bob", emailValue: "bob@example.com" }))).toEqual({ error: "The contact could not be updated." });
  });

  it("keep the wording of the form's own refusals", async () => {
    expect(await saveContactFormAction({}, form({ firstName: "Dana", groupIds: "group_elsewhere" }))).toEqual({ error: "One or more selected groups are not available in this workspace." });
    expect(await saveContactFormAction({}, form({ firstName: "Dana", scheduleFollowUp: "on", followUpDate: "" }))).toEqual({ error: "Choose a valid first follow-up date." });
  });
});

describe("the redirecting saves", () => {
  it("sign the form's message for the signed-in person only", async () => {
    const location = await redirected(createContactAction(form({ phoneValue: "12" })));
    expect(location.startsWith("/contacts/new?error=")).toBe(true);
    expect(viewerErrorMessage(params(location), owner)).toBe("Invalid phone number: 12");
    expect(viewerErrorMessage(params(location), { authUser: { id: "someone-else" } })).toBe(UNVERIFIED_ERROR_MESSAGE);
  });

  it("never put a database failure's text into the address", async () => {
    mocks.emailConflict.mockRejectedValue(new Error("connection terminated unexpectedly at 10.0.0.5"));
    const location = await redirected(updateContactAction(form({ contactId: "contact_1", revision: REVISION, firstName: "Bob", emailValue: "bob@example.com" })));
    expect(location.startsWith("/contacts/contact_1/edit?error=")).toBe(true);
    expect(viewerErrorMessage(params(location), owner)).toBe("The contact could not be updated.");
    expect(decodeURIComponent(location)).not.toContain("10.0.0.5");
  });
});

describe("view-only support sessions", () => {
  it("refuse contact saves with the view-only message on the form", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "owner" }, workspace: { id: "workspace" }, impersonation: { id: "support_view" } });
    expect(await saveContactFormAction({}, form({ firstName: "Bob" }))).toEqual({ error: VIEW_ONLY_SUPPORT_MESSAGE });
    expect(await saveContactFormAction({}, form({ contactId: "contact_1", revision: REVISION, firstName: "Bob" }))).toEqual({ error: VIEW_ONLY_SUPPORT_MESSAGE });
    expect(mocks.emailConflict).not.toHaveBeenCalled();
    expect(mocks.tx.contact.update).not.toHaveBeenCalled();
  });
});

describe("returning to Today after an edit", () => {
  it("appends contactSaved=1 to the validated Today return path", async () => {
    await expect(saveContactFormAction({}, form({ contactId: "contact_1", revision: REVISION, firstName: "Bob", phoneValue: "(555) 234-5678", returnTo: "/jumps?focus=jump_1" })))
      .rejects.toThrow("REDIRECT /jumps?focus=jump_1&contactSaved=1");
    expect(mocks.tx.contact.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "contact_1" } }));
    // The row saved under its format-based key is rewritten to the canonical key, then updated in place.
    expect(mocks.tx.contactPhone.update).toHaveBeenCalledWith({ where: { id: "phone_1" }, data: { normalized: "+15552345678" } });
    expect(mocks.tx.contactPhone.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { contactId_normalized: { contactId: "contact_1", normalized: "+15552345678" } } }));
    expect(mocks.tx.contactPhone.deleteMany).toHaveBeenCalledWith({ where: { contactId: "contact_1", normalized: { notIn: ["+15552345678"] } } });
    expect(mocks.jobCreate).toHaveBeenCalledWith({ data: { workspaceId: "workspace", task: "generate-jumps", payload: { contactId: "contact_1" } } });
  });

  it("keeps a fragment after the flag and ignores return paths that are not Today", async () => {
    await expect(saveContactFormAction({}, form({ contactId: "contact_1", revision: REVISION, firstName: "Bob", returnTo: "/jumps#review" })))
      .rejects.toThrow("REDIRECT /jumps?contactSaved=1#review");
    await expect(saveContactFormAction({}, form({ contactId: "contact_1", revision: REVISION, firstName: "Bob", returnTo: "https://evil.example/jumps" })))
      .rejects.toThrow("REDIRECT /contacts/contact_1?updated=1");
    await expect(saveContactFormAction({}, form({ contactId: "contact_1", revision: REVISION, firstName: "Bob", returnTo: "/contacts/other" })))
      .rejects.toThrow("REDIRECT /contacts/contact_1?updated=1");
  });
});
