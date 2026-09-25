import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), count: vi.fn(), findMany: vi.fn(), preference: vi.fn(), deliveries: vi.fn(), stops: vi.fn(), calendar: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  jump: { count: mocks.count, findMany: mocks.findMany },
  workspacePreference: { findUnique: mocks.preference },
  automatedDelivery: { findMany: mocks.deliveries },
  mixStop: { findMany: mocks.stops },
  calendarEntry: { findMany: mocks.calendar }
} }));
vi.mock("@/lib/display-preferences", () => ({ timezoneForWorkspace: async () => "UTC" }));
vi.mock("@/lib/automatic-delivery", () => ({
  automaticEmailConfigured: () => true,
  automaticSmsConfigured: () => true,
  preparedDelivery: (snapshot: unknown) => snapshot && typeof snapshot === "object" && "body" in snapshot ? { subject: null, body: String((snapshot as { body: unknown }).body) } : null
}));
import { GET } from "./route";

const now = new Date("2026-09-23T23:30:00Z"); // a Wednesday evening
type Row = ReturnType<typeof row>;
function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, renderedSnapshot: { body: "Hi there" }, scheduledAt: new Date(now.getTime() - 60 * 60_000), createdAt: new Date(now.getTime() - 120 * 60_000), reason: "Estimate follow-up",
    manualOnly: false, mixId: "mix", contactId: `contact-${id}`, appointmentBindingId: null, mix: { status: "ACTIVE" }, workflowInstance: null,
    contact: { displayName: `Person ${id}`, emails: [], phones: [{ phone: "+15550100200" }] }, stepVersion: { stepTemplate: { channel: "SMS" } },
    ...overrides
  };
}
async function preview(rows: Row[], query = "sms=1&minutes=30") {
  mocks.count.mockResolvedValue(rows.length); mocks.findMany.mockResolvedValue(rows);
  const response = await GET(new Request(`http://localhost/api/settings/sending-preview?${query}`));
  return { status: response.status, body: await response.json() as { items: Array<{ id: string; blockedReason: string | null; earliestAt: string | null }>; count: number; error?: string } };
}

beforeEach(() => {
  vi.useFakeTimers({ now });
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ user: { id: "owner", memberships: [{ workspaceId: "workspace" }] } });
  mocks.preference.mockResolvedValue(null);
  mocks.deliveries.mockResolvedValue([]);
  mocks.stops.mockResolvedValue([]);
  mocks.calendar.mockResolvedValue([]);
});
afterEach(() => { vi.useRealTimers(); });

describe("sending preview", () => {
  it("lists the holds the worker applies, with a plain reason, instead of promising a send", async () => {
    mocks.stops.mockResolvedValue([{ mixId: "mix", contactId: "contact-stopped", reason: null }, { mixId: "mix", contactId: "contact-stage-exit", reason: "journey.stage.exit" }, { mixId: "mix", contactId: "contact-stage-exit-unbound", reason: "journey.stage.exit" }]);
    const { body } = await preview([
      row("paused", { mix: { status: "PAUSED" } }),
      row("archived", { mix: { status: "ARCHIVED" } }),
      row("quick-add", { manualOnly: true }),
      row("stopped"),
      row("stage-exit", { appointmentBindingId: "binding" }),
      row("stage-exit-unbound"),
      row("work-paused", { workflowInstance: { status: "PAUSED", state: {} } }),
      row("work-updating", { workflowInstance: { status: "ACTIVE", state: { pendingBusinessUpdate: { requestId: "r" } } } }),
      row("clean", { workflowInstance: { status: "ACTIVE", state: {} } })
    ]);
    const reasons = Object.fromEntries(body.items.map(item => [item.id, item.blockedReason]));
    expect(reasons).toEqual({
      paused: "Its Mix is paused",
      archived: "Its Mix is archived",
      "quick-add": "Quick Add capture waits for you",
      stopped: "Stopped for this person",
      "stage-exit": null,
      "stage-exit-unbound": "Stopped for this person",
      "work-paused": "Its path is paused or finished",
      "work-updating": "Waiting for an already-processing message",
      clean: null
    });
    for (const item of body.items) expect(item.earliestAt === null).toBe(item.blockedReason !== null);
    expect(mocks.stops.mock.calls[0][0].where).toEqual({ workspaceId: "workspace", OR: expect.arrayContaining([{ mixId: "mix", contactId: "contact-clean" }]) });
  });

  it("keeps the worker's per-row blocks and the earliest time when nothing holds it", async () => {
    mocks.deliveries.mockResolvedValue([{ jumpId: "tried" }]);
    const { body } = await preview([row("tried"), row("no-phone", { contact: { displayName: "No phone", emails: [], phones: [] } }), row("empty", { renderedSnapshot: {} }), row("ready")]);
    expect(body.items.map(item => item.blockedReason)).toEqual([
      "An earlier delivery attempt is recorded. Review its status; this message will not be sent again automatically.",
      "Missing recipient",
      "Prepared message is missing or incomplete",
      null
    ]);
    // Due an hour ago with a 30-minute window: eligible already, so the earliest time is now.
    expect(body.items[3].earliestAt).toBe(now.toISOString());
  });

  it("applies quiet hours, working hours and appointments to the earliest time, as the worker does", async () => {
    mocks.preference.mockResolvedValue({ quietHoursStart: 22 * 60, quietHoursEnd: 7 * 60, appointmentBufferMinutes: 15, journeyPreferences: { version: 1, communication: "RECOMMENDED", pace: "RECOMMENDED", workDays: [1, 2, 3, 4, 5], workStart: 9 * 60, workEnd: 17 * 60, avoidAppointments: true } });
    mocks.calendar.mockResolvedValue([{ startsAt: new Date("2026-09-24T09:00:00Z"), endsAt: new Date("2026-09-24T10:00:00Z"), kind: "MEETING" }]);
    const { body } = await preview([row("evening")]);
    // 23:30 is quiet until 07:00; working hours start at 09:00; the meeting and its buffer end at 10:15.
    expect(body.items[0]).toMatchObject({ blockedReason: null, earliestAt: "2026-09-24T10:15:00.000Z" });
    expect(mocks.calendar.mock.calls[0][0].where).toMatchObject({ workspaceId: "workspace", canceledAt: null });
    expect(mocks.calendar.mock.calls[0][0].take).toBe(200);
  });

  it("does not read the calendar when appointments are not avoided", async () => {
    mocks.preference.mockResolvedValue({ quietHoursStart: 22 * 60, quietHoursEnd: 7 * 60, appointmentBufferMinutes: 15, journeyPreferences: null });
    const { body } = await preview([row("evening")]);
    expect(mocks.calendar).not.toHaveBeenCalled();
    expect(body.items[0].earliestAt).toBe("2026-09-24T07:00:00.000Z");
  });

  it("keeps the worker's query filters, the workspace scope, the sign-in requirement and the listed windows", async () => {
    await preview([]);
    expect(mocks.findMany.mock.calls[0][0].where).toMatchObject({ workspaceId: "workspace", status: "PENDING", accessInviteId: null, drafts: { none: {} }, contact: { archivedAt: null } });
    expect(mocks.findMany.mock.calls[0][0].where.AND[0]).toEqual({ OR: [{ appointmentBindingId: null }, { appointmentBinding: { automaticDelivery: true } }] });
    expect(mocks.findMany.mock.calls[0][0].select).toMatchObject({ manualOnly: true, mix: { select: { status: true } }, workflowInstance: { select: { status: true, state: true } } });
    expect(mocks.stops).not.toHaveBeenCalled();
    expect((await preview([], "sms=1&minutes=45")).status).toBe(400);
    mocks.session.mockResolvedValue(null);
    expect((await preview([])).status).toBe(401);
  });
});
