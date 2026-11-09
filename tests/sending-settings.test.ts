import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  email: false, sms: false, viewOnly: false,
  automation: null as null | { enabled: boolean; emailEnabled: boolean; smsEnabled: boolean; reviewWindowMinutes: number },
  save: vi.fn(async () => ({}))
}));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => ({ session: {}, user: { id: "owner" }, workspace: { id: "synthetic-workspace" }, impersonation: state.viewOnly ? { id: "support-view" } : null }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { automationPreference: { findUnique: async () => state.automation } } }));
vi.mock("@/lib/display-preferences", () => ({ displayPreferencesForUser: async () => ({ locale: "en-US" }) }));
vi.mock("@/lib/automatic-delivery", () => ({ automaticEmailConfigured: () => state.email, automaticSmsConfigured: () => state.sms }));
vi.mock("@/lib/notification-actions", () => ({ updateAutomationPreferencesFormAction: state.save }));
import SendingSettingsPage from "@/app/(app)/settings/sending/page";
import { DEFAULT_AUTOMATIC_DELIVERY_WINDOW } from "@/lib/automatic-delivery-window-options";

const render = async () => renderToStaticMarkup(await SendingSettingsPage({ searchParams: Promise.resolve({}) }));
beforeEach(() => { state.email = false; state.sms = false; state.viewOnly = false; state.automation = null; state.save.mockClear(); });

describe("sending settings capability and saved-state matrix", () => {
  for (const email of [false, true]) for (const sms of [false, true]) {
    for (const enabled of [false, true]) for (const emailEnabled of [false, true]) for (const smsEnabled of [false, true]) {
      for (const viewOnly of [false, true]) {
        it(`capability email=${email} text=${sms}; saved on=${enabled} email=${emailEnabled} text=${smsEnabled}; viewOnly=${viewOnly}`, async () => {
          Object.assign(state, { email, sms, viewOnly, automation: { enabled, emailEnabled, smsEnabled, reviewWindowMinutes: 60 } });
          const html = await render();
          const available = email || sms;
          const selected = [emailEnabled && email, smsEnabled && sms].some(Boolean);
          const unavailable = [emailEnabled && !email, smsEnabled && !sms].some(Boolean);
          const expected = !enabled ? "Off" : !emailEnabled && !smsEnabled ? "On · No channels selected"
            : unavailable ? selected ? "On · Some channels unavailable" : "On · Unavailable" : "On";
          expect(html).toContain(`<span class="status-pill">${expected}</span>`);
          expect(html).toContain(`<h2>${!enabled ? "You review and send" : selected ? "Automatic sending is on" : "Nothing can send automatically (saved setting: On)"}</h2>`);
          expect(html).toContain(`Email: ${enabled && emailEnabled ? "On" : "Off"} · ${email ? "Available" : "Unavailable"}`);
          expect(html).toContain(`Text: ${enabled && smsEnabled ? "On" : "Off"} · ${sms ? "Available" : "Unavailable"}`);
          expect(html).toContain(`<details class="card"><summary>${available ? "Configure automatic sending" : "Automatic sending details"}</summary>`);
          expect(html).not.toContain("<details open");
          expect(html.includes('name="automationEnabled"')).toBe(available);
          expect(html.includes('name="automationConsent"')).toBe(available);
          expect(html.includes("Turn off automatic sending")).toBe(enabled);
          const preview = html.match(/<button[^>]*>Preview affected messages<\/button>/)?.[0];
          expect(preview).toBeDefined();
          expect(preview).not.toContain("disabled");
          if (available) {
            expect(html).toContain('<fieldset class="sending-options">');
            const save = html.match(/<button[^>]*>Save automatic sending<\/button>/)?.[0];
            expect(save?.includes('disabled=""')).toBe(viewOnly);
            for (const [name, capability] of [["Email", email], ["Sms", sms]] as const) {
              const field = html.match(new RegExp(`<input[^>]*name="automation${name}Enabled"[^>]*>`))?.[0];
              expect(field?.includes('disabled=""')).toBe(!capability);
            }
          } else {
            expect(html).not.toContain("<fieldset");
            expect(html).not.toContain("required=");
            expect(html).not.toContain("Save automatic sending");
          }
          if (enabled) {
            const off = html.match(/<form[^>]*><input type="hidden" name="reviewWindowMinutes" value="60"\/>[\s\S]*?Turn off automatic sending<\/button>/)?.[0];
            expect(off).toBeDefined();
            expect(off).not.toContain("automationEnabled");
            expect(off?.includes('disabled=""')).toBe(viewOnly);
          } else {
            expect(html).toContain("Opening an app does not mark a message sent.");
          }
          expect(state.save).not.toHaveBeenCalled();
        });
      }
    }
  }
  it("defaults a workspace without saved preferences to review, open and record", async () => {
    const html = await render();
    expect(html).toContain("You review and send");
    expect(html).toContain("then return to record what happened");
    expect(html).not.toContain('name="automationEnabled"');
    expect(html).not.toContain("Turn off automatic sending");
    expect(html).toContain('href="/jumps"');
  });
  for (const email of [false, true]) {
    it(`normalizes an unlisted preview window while preserving the turn-off value; email available=${email}`, async () => {
      state.email = email;
      state.automation = { enabled: true, emailEnabled: true, smsEnabled: false, reviewWindowMinutes: 45 };
      const html = await render();
      expect(html).toMatch(/<form[^>]*><input type="hidden" name="reviewWindowMinutes" value="45"\/>[\s\S]*?Turn off automatic sending/);
      if (email) {
        expect(html).toContain(`<option value="${DEFAULT_AUTOMATIC_DELIVERY_WINDOW}" selected="">`);
      } else {
        expect(html).toContain(`<input type="hidden" name="reviewWindowMinutes" value="${DEFAULT_AUTOMATIC_DELIVERY_WINDOW}"/>`);
      }
      expect(state.save).not.toHaveBeenCalled();
    });
  }
});
