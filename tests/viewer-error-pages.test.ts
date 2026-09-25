import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Settings pages show a ?error= message only when it was signed for the person viewing them; during a support
// view that person is the signed-in staff member (session.authUser), not the customer whose account is open.
const state = vi.hoisted(() => ({ impersonation: null as null | { id: string } }));
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/env")>();
  return { ...actual, env: { ...actual.env, authRateLimitSecret: "viewer-error-pages-test-secret-0001" } };
});
vi.mock("@/lib/auth", () => ({
  requireWorkspace: async () => ({
    session: { id: "session-1", authUser: { id: state.impersonation ? "support-staff" : "customer" } },
    workspace: { id: "workspace-1", name: "Customer business", profile: null },
    user: { id: "customer", name: "Casey Customer", email: "casey@example.test" },
    impersonation: state.impersonation
  })
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    automationPreference: { findUnique: async () => ({ enabled: false, emailEnabled: true, smsEnabled: false, reviewWindowMinutes: 30 }) },
    dateType: { findMany: async () => [] }
  }
}));
vi.mock("@/lib/automatic-delivery", () => ({ automaticEmailConfigured: () => true, automaticSmsConfigured: () => false }));
vi.mock("@/lib/notification-actions", () => ({ updateAutomationPreferencesFormAction: async () => ({}) }));
vi.mock("@/lib/date-type-actions", () => ({ createCustomDateTypeAction: async () => undefined, deleteCustomDateTypeAction: async () => undefined, renameCustomDateTypeAction: async () => undefined, saveActiveDateTypesAction: async () => undefined }));
import JumpDateTypesPage from "@/app/(app)/settings/jump-date-types/page";
import SendingSettingsPage from "@/app/(app)/settings/sending/page";
import { UNVERIFIED_ERROR_MESSAGE, withViewerError } from "@/lib/form-errors";

const customer = { authUser: { id: "customer" } }, staff = { authUser: { id: "support-staff" } };
const signed = (message: string, viewer: { authUser: { id: string } }) => Object.fromEntries(new URL(withViewerError("/settings", message, viewer), "https://app.invalid").searchParams);
const alert = (html: string) => html.match(/<div class="notice error" role="alert">([^<]*)<\/div>/)?.[1] ?? null;
const pages = {
  Sending: async (query: Record<string, string>) => alert(renderToStaticMarkup(await SendingSettingsPage({ searchParams: Promise.resolve(query) }))),
  "Date types": async (query: Record<string, string>) => alert(renderToStaticMarkup(await JumpDateTypesPage({ searchParams: Promise.resolve(query) })))
};

beforeEach(() => { state.impersonation = null; });

describe.each(Object.entries(pages))("%s page error banner", (_name, render) => {
  it("shows a message signed for the person viewing it", async () => {
    expect(await render(signed("Choose email, text, or both for automatic sending.", customer))).toBe("Choose email, text, or both for automatic sending.");
    expect(await render({})).toBeNull();
  });

  it("shows only the fixed sentence for a crafted link or one signed for someone else", async () => {
    expect(await render({ error: "Your account is suspended. Call +1 800 555 0100 to verify your card." })).toBe(UNVERIFIED_ERROR_MESSAGE);
    expect(await render(signed("Call +1 800 555 0100 to verify your card.", staff))).toBe(UNVERIFIED_ERROR_MESSAGE);
  });

  it("verifies against the signed-in staff member during a support view", async () => {
    state.impersonation = { id: "support-view" };
    expect(await render(signed("This support session is view-only. End the support view before making changes.", staff))).toBe("This support session is view-only. End the support view before making changes.");
    expect(await render(signed("Choose email, text, or both for automatic sending.", customer))).toBe(UNVERIFIED_ERROR_MESSAGE);
  });
});
