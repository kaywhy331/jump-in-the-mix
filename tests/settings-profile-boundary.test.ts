import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  impersonation: null as null | { id: string },
  company: "Example Plumbing",
  placement: { placement: "MIX", mix: { id: "mix-1", name: "Estimate follow-up" } } as { placement: "NONE" | "ASK" | "MIX"; mix: { id: string; name: string } | null },
  sessions: vi.fn(async () => 2),
  contacts: vi.fn(async () => 17),
  automaticAvailable: false
}));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => ({
  workspace: { id: "workspace-1", profile: { company: state.company } },
  user: { id: "owner-1", name: "Casey Example" }, impersonation: state.impersonation
}) }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  workspacePreference: { findUnique: async () => ({ defaultFollowUpMinutes: 825, quietHoursStart: 1200, quietHoursEnd: 480, appointmentBufferMinutes: 0, weekendScheduling: "KEEP" }) },
  journeyPreference: { findUnique: async () => ({ enabled: false }) },
  journeyStage: { count: async () => 3 },
  intakeConnection: { count: async () => 1 },
  calendarConnection: { count: async () => 2 },
  notificationPreference: { findUnique: async () => ({ emailDigestEnabled: true, weeklyReportEnabled: false }) },
  automationPreference: { findUnique: async () => ({ enabled: true, emailEnabled: true, smsEnabled: false }) },
  dateType: { count: async () => 6 },
  session: { count: state.sessions },
  contact: { count: state.contacts }
} }));
vi.mock("@/lib/display-preferences", () => ({ displayPreferencesForUser: async () => ({ locale: "en-US", timeZone: "America/New_York" }) }));
vi.mock("@/lib/new-contact-placement", () => ({ newContactPlacementSetting: async () => state.placement }));
vi.mock("@/lib/automatic-delivery", () => ({ automaticEmailConfigured: () => state.automaticAvailable, automaticSmsConfigured: () => false }));
import SettingsPage from "@/app/(app)/settings/page";
import { RepeatableProfileRecords } from "@/components/RepeatableProfileRecords";

const read = (path: string) => readFileSync(path, "utf8");

beforeEach(() => {
  state.impersonation = null;
  state.company = "Example Plumbing";
  state.placement = { placement: "MIX", mix: { id: "mix-1", name: "Estimate follow-up" } };
  state.automaticAvailable = false;
  vi.clearAllMocks();
});

describe("settings and profile design boundaries", () => {
  it("stores repeatable profile records additively while retaining legacy fields", () => {
    const schema = read("prisma/schema.prisma");
    const migration = read("prisma/migrations/20260719173000_repeatable_workspace_profile/migration.sql");

    expect(schema).toMatch(/\bproducts\s+Json\?/);
    expect(schema).toMatch(/\bsenderDetails\s+Json\?/);
    expect(migration).toContain('ADD COLUMN "products" JSONB');
    expect(migration).toContain('ADD COLUMN "senderDetails" JSONB');
    expect(migration).not.toMatch(/DROP\s+(COLUMN|TABLE)/i);
  });

  it("exposes only personal and core workflow settings", () => {
    const page = read("src/app/(app)/settings/page.tsx");
    for (const title of ["My business", "Personal preferences", "Notifications", "Date types", "Password & sessions", "Data & privacy"]) expect(page).toContain(title);
    const business = read("src/app/(app)/settings/business/page.tsx");
    for (const field of ["Business name", "Services", "Text signature", "Email signature"]) expect(business).toContain(field);
    expect(page).not.toMatch(/community|billing|integration|workspace profile|workspace switcher/i);
  });

  it("groups all destinations under D81 headings and displays saved values", async () => {
    const html = renderToStaticMarkup(await SettingsPage());
    expect([...html.matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map(match => match[1])).toEqual(["Your business", "People and leads", "You", "Account"]);
    expect(html.match(/class="settings-hub-card"/g)).toHaveLength(12);
    for (const value of ["Example Plumbing", "2 calendar connections on", "Follow-ups at 1:45 PM · New York time", "3 stages · Rules paused", "Estimate follow-up", "1 connection on", "6 date types available", "Casey Example · New York time", "Morning email on · Weekly report off", "2 active sessions", "17 contacts saved"]) expect(html).toContain(value);
    expect(state.sessions).toHaveBeenCalledWith({ where: { userId: "owner-1", expiresAt: { gt: expect.any(Date) } } });
    expect(state.contacts).toHaveBeenCalledWith({ where: { workspaceId: "workspace-1" } });
    state.company = "Updated business";
    expect(renderToStaticMarkup(await SettingsPage())).toContain("Updated business");
  });

  it("shows the effective placement and available sending modes", async () => {
    state.placement = { placement: "MIX", mix: null };
    let html = renderToStaticMarkup(await SettingsPage());
    expect(html).toContain("No Mix");
    expect(html).toContain("You review and send");
    expect(html).not.toContain("Automatic email on");
    state.placement = { placement: "ASK", mix: null };
    state.automaticAvailable = true;
    html = renderToStaticMarkup(await SettingsPage());
    expect(html).toContain("Ask each time");
    expect(html).toContain("Automatic email on");
  });

  it("keeps private account summaries out of support views", async () => {
    state.impersonation = { id: "support-view" };
    const html = renderToStaticMarkup(await SettingsPage());
    expect(html).toContain("Private during support view");
    expect(html).not.toContain("Casey Example");
    expect(html).not.toContain("active sessions");
    expect(state.sessions).not.toHaveBeenCalled();
  });

  it("labels message wording, preserves service order and only offers useful row controls", () => {
    const props = { fieldName: "products", title: "Services", description: "Message wording", nameLabel: "Service name", valueLabel: "Text used in messages", addLabel: "Add service", maximum: 5 };
    const render = (initial: { name: string; value: string }[]) => renderToStaticMarkup(createElement(RepeatableProfileRecords, { ...props, initial }));
    const blank = render([]);
    expect(blank).toContain("Service name");
    expect(blank).toContain("Text used in messages");
    expect(blank).toContain("Add service");
    expect(blank).not.toContain("Remove");
    expect(blank).not.toContain("Move ");
    const first = { name: "Repairs", value: "repairing your sink" };
    const second = { name: "Checks", value: "checking your pipes" };
    expect(render([first])).not.toContain("Move ");
    const two = render([first, second]);
    expect(two).toContain("Move Repairs down");
    expect(two).toContain("Move Checks up");
    expect(two.indexOf("repairing your sink")).toBeLessThan(two.indexOf("checking your pipes"));
    expect(render([first, second, first, second, first])).not.toContain(">Add service<");
  });
});
