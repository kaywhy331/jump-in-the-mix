import { beforeEach, describe, expect, it, vi } from "vitest";

// The Profile card's locale is validated against the offered list (audit F8, 2026-09-24).
const mocks = vi.hoisted(() => ({ requireWorkspace: vi.fn(), transaction: vi.fn(async () => []), userUpdate: vi.fn(), upsert: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: mocks.requireWorkspace }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction, user: { update: mocks.userUpdate }, userPreference: { upsert: mocks.upsert }, auditLog: { create: mocks.audit } } }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
import { updatePersonalPreferencesFormAction } from "../src/lib/account-preference-actions";

function profile(fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ name: "Pat Plumber", timezone: "America/Chicago", ...fields })) form.set(key, value);
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireWorkspace.mockResolvedValue({ user: { id: "user-1" }, workspace: { id: "workspace-1" }, impersonation: null });
});

describe("updatePersonalPreferencesAction locale", () => {
  it("rejects a tag that is not on the offered list before saving anything", async () => {
    for (const locale of ["en_US", "xx-INVALID!!", "fr-CA"]) {
      await expect(updatePersonalPreferencesFormAction({}, profile({ locale }))).resolves.toEqual({ error: "Choose one of the listed locales." });
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("saves an offered locale and returns to the preferences page", async () => {
    await expect(updatePersonalPreferencesFormAction({}, profile({ locale: "en-GB" }))).rejects.toThrow("REDIRECT /account/preferences?personalSaved=1");
    expect(mocks.upsert).toHaveBeenCalledWith({ where: { userId: "user-1" }, create: { userId: "user-1", locale: "en-GB", timezone: "America/Chicago" }, update: { locale: "en-GB", timezone: "America/Chicago" } });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("treats a missing locale as en-US", async () => {
    await expect(updatePersonalPreferencesFormAction({}, profile({}))).rejects.toThrow("REDIRECT /account/preferences?personalSaved=1");
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { locale: "en-US", timezone: "America/Chicago" } }));
  });
});
