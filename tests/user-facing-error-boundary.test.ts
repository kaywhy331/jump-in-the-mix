import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserFacingError } from "@/lib/user-facing-error";

const mocks = vi.hoisted(() => ({ scheduleVisit: vi.fn(), installMegaMix: vi.fn(), saveWorkflowConfiguration: vi.fn(), previewWorkflowStart: vi.fn() }));
const session = { user: { id: "owner", memberships: [{ workspaceId: "business" }] }, impersonation: null };
vi.mock("@/lib/auth", () => ({
  requireWorkspace: async () => ({ workspace: { id: "business" }, user: { id: "owner", name: "Owner" }, session: { authUser: { id: "owner" } }, impersonation: null }),
  getCurrentSession: async () => session
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock("@/lib/appointment-bindings", async original => ({ ...await original<typeof import("@/lib/appointment-bindings")>(), scheduleVisit: mocks.scheduleVisit }));
vi.mock("@/lib/mega-mix-service", () => ({ installMegaMix: mocks.installMegaMix }));
vi.mock("@/lib/mega-mixes", () => ({ megaMixById: () => ({ id: "contractor", version: 1 }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: async (run: (db: unknown) => unknown) => run({}) } }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/worker-dispatch-after", () => ({ wakeWorkerAfterResponse: vi.fn() }));
vi.mock("@/lib/workflow-start-preview", () => ({ previewWorkflowStart: mocks.previewWorkflowStart }));
vi.mock("@/lib/mix-workflow", async original => ({ ...await original<typeof import("@/lib/mix-workflow")>(), saveWorkflowConfiguration: mocks.saveWorkflowConfiguration }));

import { saveCalendarAction } from "../src/lib/calendar-actions";
import { installMegaMixAction } from "../src/lib/mega-mix-actions";
import { GET, POST } from "../src/app/api/mix-workflow/route";

const form = (values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; };
const databaseError = () => new Error("duplicate key value violates unique constraint \"CalendarEntry_pkey\"");
const visit = () => saveCalendarAction({ error: "" }, form({ title: "Visit", kind: "MEETING", timezone: "UTC", startsAt: "2026-10-01T09:00", endsAt: "2026-10-01T10:00", version: "0" }));
const install = () => installMegaMixAction({}, form({ blueprintId: "contractor", reviewed: "on", version: "1" }));
const configure = () => POST(new Request("http://localhost/api/mix-workflow", { method: "POST", body: JSON.stringify({ action: "configure", configuration: {}, expectedRevision: 0 }) }));
const preview = () => GET(new Request("http://localhost/api/mix-workflow?previewStart=1&contactId=c&mixId=m"));

describe("only wording our own code writes reaches the person", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps a refusal's wording", async () => {
    mocks.scheduleVisit.mockRejectedValue(new UserFacingError("This event changed. Refresh the calendar before editing it."));
    expect(await visit()).toEqual({ error: "This event changed. Refresh the calendar before editing it." });
    mocks.installMegaMix.mockRejectedValue(new UserFacingError("This mega-mix has changed. Reload its preview before adding it."));
    expect(await install()).toEqual({ error: "This mega-mix has changed. Reload its preview before adding it." });
    mocks.saveWorkflowConfiguration.mockRejectedValue(new UserFacingError("Choose an available Mix in this account."));
    expect(await (await configure()).json()).toEqual({ error: "Choose an available Mix in this account." });
    mocks.previewWorkflowStart.mockRejectedValue(new UserFacingError("This Mix has no starting Beats. Review its connections before starting it."));
    expect(await (await preview()).json()).toEqual({ error: "This Mix has no starting Beats. Review its connections before starting it." });
  });

  it("replaces database and unexpected errors with a fixed sentence", async () => {
    mocks.scheduleVisit.mockRejectedValue(databaseError());
    expect(await visit()).toEqual({ error: "This event could not be saved. Your entries are kept." });
    mocks.installMegaMix.mockRejectedValue(databaseError());
    expect(await install()).toEqual({ error: "The mega-mix could not be added. Your choices have been kept." });
    mocks.saveWorkflowConfiguration.mockRejectedValue(databaseError());
    const configured = await configure();
    expect(configured.status).toBe(400);
    expect(await configured.json()).toEqual({ error: "The change could not be saved." });
    mocks.previewWorkflowStart.mockRejectedValue(databaseError());
    expect(await (await preview()).json()).toEqual({ error: "This start could not be checked." });
  });
});
