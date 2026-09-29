import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ impersonation: null as null | { id: string } }));
vi.mock("@/lib/auth", () => ({
  requireWorkspace: async () => ({
    workspace: { id: "workspace-1", name: "Customer business", profile: null },
    user: { id: "customer", name: "Casey Customer", email: "casey@example.test" },
    impersonation: state.impersonation
  })
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    automationPreference: { findUnique: async () => ({ enabled: false, emailEnabled: true, smsEnabled: false, reviewWindowMinutes: 30 }) },
    dateType: {
      findMany: async ({ where }: { where: { isSystem: boolean } }) => where.isSystem ? [] : [{ id: "type-1", name: "Warranty expires", isActive: true, mixes: [], _count: { jumpDates: 2, mixes: 0 } }]
    }
  }
}));
vi.mock("@/lib/automatic-delivery", () => ({ automaticEmailConfigured: () => true, automaticSmsConfigured: () => false }));
vi.mock("@/lib/notification-actions", () => ({ updateAutomationPreferencesFormAction: async () => ({}) }));
vi.mock("@/lib/date-type-actions", () => ({ createCustomDateTypeAction: async () => undefined, deleteCustomDateTypeAction: async () => undefined, renameCustomDateTypeAction: async () => undefined, saveActiveDateTypesAction: async () => undefined }));
vi.mock("@/lib/auth-actions", () => ({ logoutAction: async () => undefined }));
vi.mock("@/components/Appearance", () => ({ AppearanceControl: () => null }));
vi.mock("@/lib/invitation-allowance", async (original) => ({ ...(await original<typeof import("@/lib/invitation-allowance")>()), invitationsLeft: async () => null }));
import MorePage from "@/app/(app)/more/page";
import JumpDateTypesPage from "@/app/(app)/settings/jump-date-types/page";
import SendingSettingsPage from "@/app/(app)/settings/sending/page";
import { VIEW_ONLY_SETTINGS_MESSAGE } from "@/components/ViewOnlySupportNotice";

type Control = { attributes: string; label: string };
const buttons = (html: string): Control[] => [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((match) => ({ attributes: match[1], label: match[2].replace(/<[^>]+>/g, "") }));
function button(html: string, label: string): Control {
  const found = buttons(html).find((item) => item.label === label);
  if (!found) throw new Error(`No "${label}" button in the page.`);
  return found;
}
const disabled = (control: Control) => /\sdisabled=""/.test(control.attributes);
const tag = (html: string, name: string, attribute: string) => html.match(new RegExp(`<${name}\\b[^>]*${attribute}[^>]*>`))?.[0] ?? "";
const noSearch = { searchParams: Promise.resolve({}) };

beforeEach(() => { state.impersonation = null; });

describe("settings during a view-only support session", () => {
  it("Sending shows the notice, keeps the queue preview usable and disables saving", async () => {
    const owner = renderToStaticMarkup(await SendingSettingsPage(noSearch));
    expect(owner).not.toContain(VIEW_ONLY_SETTINGS_MESSAGE);
    expect(disabled(button(owner, "Save automatic sending"))).toBe(false);

    state.impersonation = { id: "support-view" };
    const view = renderToStaticMarkup(await SendingSettingsPage(noSearch));
    expect(view).toContain(VIEW_ONLY_SETTINGS_MESSAGE);
    expect(disabled(button(view, "Save automatic sending"))).toBe(true);
    expect(disabled(button(view, "Preview affected messages"))).toBe(false);
    expect(view).toMatch(/<fieldset class="sending-options">/);
    expect(view).not.toContain("form-guard-status");
  });

  it("Date types shows the notice, disables every save and hides deletion", async () => {
    const owner = renderToStaticMarkup(await JumpDateTypesPage(noSearch));
    expect(owner).not.toContain(VIEW_ONLY_SETTINGS_MESSAGE);
    expect(buttons(owner).map((item) => item.label)).toContain("Confirm delete");
    expect(disabled(button(owner, "Create type"))).toBe(false);

    state.impersonation = { id: "support-view" };
    const view = renderToStaticMarkup(await JumpDateTypesPage(noSearch));
    expect(view).toContain(VIEW_ONLY_SETTINGS_MESSAGE);
    for (const label of ["Create type", "Save active selection"]) expect(disabled(button(view, label)), label).toBe(true);
    expect(buttons(view).map((item) => item.label)).not.toContain("Confirm delete");
    expect(tag(view, "input", 'value="type-1"')).toContain('disabled=""');
    expect(tag(owner, "input", 'value="type-1"')).not.toContain("disabled");
    expect(view).toContain("2 saved dates</span><span>0 Mixes</span>");
    expect(disabled(button(view, "Search"))).toBe(false);
  });

  it("More offers ending the support view instead of signing the customer out", async () => {
    const owner = renderToStaticMarkup(await MorePage());
    expect(buttons(owner).map((item) => item.label)).toContain("Sign out");
    expect(owner).not.toContain("/api/admin/impersonation/end");
    expect(owner).toContain("quiet hours, and working days.");

    state.impersonation = { id: "support-view" };
    const view = renderToStaticMarkup(await MorePage());
    expect(view).toContain("This support session is view-only. End it to return to the support case.");
    expect(buttons(view).map((item) => item.label)).not.toContain("Sign out");
    const endForm = tag(view, "form", 'action="/api/admin/impersonation/end"');
    expect(endForm).toContain('method="post"');
    expect(view).toContain(`${endForm}<button class="button" type="submit">End view-only session</button></form>`);
  });
});
