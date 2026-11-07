import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ email: false, sms: false, viewOnly: false, upsert: vi.fn(), audit: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(path); } }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => ({ workspace: { id: "session-workspace" }, user: { id: "owner" }, session: { id: "session" }, impersonation: state.viewOnly ? {} : null }) }));
vi.mock("@/lib/access-lock", () => ({ lockAccess: async () => undefined }));
vi.mock("@/lib/form-errors", () => ({ captureFormFailure: () => undefined, withViewerError: (_path: string, error: string) => error, recoverableFormAction: vi.fn() }));
vi.mock("@/lib/automatic-delivery", () => ({ automaticEmailConfigured: () => state.email, automaticSmsConfigured: () => state.sms }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: async (callback: (tx: unknown) => unknown) => callback({ session: { findFirst: async () => ({ id: "session" }) }, automationPreference: { upsert: state.upsert }, auditLog: { create: state.audit } }) } }));
import { updateAutomationPreferencesAction } from "@/lib/notification-actions";

function data(values: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ reviewWindowMinutes: "30", ...values })) form.set(key, value);
  return form;
}
beforeEach(() => { state.email = false; state.sms = false; state.viewOnly = false; state.upsert.mockClear(); state.audit.mockClear(); });

describe("sending presentation keeps the existing save contract", () => {
  it("the compact turn-off payload disables every channel while capability is unavailable", async () => {
    await expect(updateAutomationPreferencesAction(data())).rejects.toThrow("automationSaved=1");
    expect(state.upsert).toHaveBeenCalledWith({ where: { workspaceId: "session-workspace" }, create: { workspaceId: "session-workspace", enabled: false, emailEnabled: false, smsEnabled: false, reviewWindowMinutes: 30 }, update: { enabled: false, emailEnabled: false, smsEnabled: false, reviewWindowMinutes: 30 } });
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "automation.disabled" }) }));
  });
  it("view-only cannot disable through a forged submission", async () => {
    state.viewOnly = true;
    await expect(updateAutomationPreferencesAction(data())).rejects.toThrow("View-only sessions cannot change automatic sending");
    expect(state.upsert).not.toHaveBeenCalled();
  });
  it("turning off preserves a valid saved window outside the preview choices", async () => {
    await expect(updateAutomationPreferencesAction(data({ reviewWindowMinutes: "45" }))).rejects.toThrow("automationSaved=1");
    expect(state.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { enabled: false, emailEnabled: false, smsEnabled: false, reviewWindowMinutes: 45 }
    }));
  });
  it("activation still requires explicit consent", async () => {
    state.email = true;
    await expect(updateAutomationPreferencesAction(data({ automationEnabled: "on", automationEmailEnabled: "on" }))).rejects.toThrow("without a final tap");
    expect(state.upsert).not.toHaveBeenCalled();
  });
  it("activation still requires an available selected channel", async () => {
    for (const channel of ["Email", "Sms"]) {
      await expect(updateAutomationPreferencesAction(data({ automationEnabled: "on", [`automation${channel}Enabled`]: "on", automationConsent: "on" }))).rejects.toThrow("not configured");
    }
    expect(state.upsert).not.toHaveBeenCalled();
  });
  it("activation with no selected channel is refused", async () => {
    state.email = true;
    await expect(updateAutomationPreferencesAction(data({ automationEnabled: "on", automationConsent: "on" }))).rejects.toThrow("Choose email, text, or both");
    expect(state.upsert).not.toHaveBeenCalled();
  });
  it("valid activation keeps the review window and session workspace", async () => {
    state.sms = true;
    await expect(updateAutomationPreferencesAction(data({ workspaceId: "untrusted-workspace", automationEnabled: "on", automationSmsEnabled: "on", automationConsent: "on", reviewWindowMinutes: "60" }))).rejects.toThrow("automationSaved=1");
    expect(state.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { workspaceId: "session-workspace" }, update: { enabled: true, emailEnabled: false, smsEnabled: true, reviewWindowMinutes: 60 } }));
  });
});
