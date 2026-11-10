import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Connect and import answer the open form with an error or what was added (JITM-UXS-01, F-01, F-14);
// the other connection intents still return to the calendar as before.
const mocks = vi.hoisted(() => ({
  workspace: vi.fn(), refresh: vi.fn(),
  count: vi.fn(), create: vi.fn(), remove: vi.fn(), removeMany: vi.fn(), disable: vi.fn(),
  preferenceUpsert: vi.fn(), preferenceRemoveMany: vi.fn(),
  importCalendar: vi.fn(), syncCalendar: vi.fn()
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, env: { ...actual.env, authRateLimitSecret: "calendar-actions-test-secret-000001" } };
});
vi.mock("@/lib/auth", () => ({ requireWorkspace: mocks.workspace }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  calendarConnection: { count: mocks.count, create: mocks.create, delete: mocks.remove, deleteMany: mocks.removeMany, updateMany: mocks.disable },
  calendarPreference: { upsert: mocks.preferenceUpsert, deleteMany: mocks.preferenceRemoveMany }
} }));
vi.mock("@/lib/calendar", () => ({ importCalendar: mocks.importCalendar, syncCalendarConnection: mocks.syncCalendar, queueBoundReconciliation: vi.fn() }));
vi.mock("@/lib/appointment-bindings", () => ({ ContactChoiceRequiredError: class ContactChoiceRequiredError extends Error {}, recordAppointmentOutcome: vi.fn(), scheduleVisit: vi.fn(), setAppointmentBindingDelivery: vi.fn(), setAppointmentBindingHold: vi.fn() }));
vi.mock("@/lib/integration-crypto", () => ({ encryptIntegrationCredentials: () => "encrypted" }));
vi.mock("@/lib/connection-tokens", () => ({ createConnectionToken: () => ({ tokenHash: "hash", tokenEncrypted: "token" }) }));

import { addCalendarConnectionAction, calendarConnectionAction } from "./calendar-actions";
import { viewerErrorMessage } from "./form-errors";
import { UserFacingError } from "./user-facing-error";

const owner = { authUser: { id: "owner" } };
const KEPT = "Your entries are kept.";
const REFRESH_FAILED = "Could not refresh this calendar. Previous availability is kept. Check the provider’s sharing URL or reconnect.";

function form(fields: Record<string, string>, file?: File): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  if (file) data.set("file", file);
  return data;
}
const connect = (fields: Record<string, string> = {}) => addCalendarConnectionAction({}, form({ intent: "connect", name: "Work calendar", timezone: "America/Chicago", url: "https://calendar.example/feed.ics", ...fields }));
const ics = (body = "BEGIN:VCALENDAR\nEND:VCALENDAR", name = "work.ics") => new File([body], name, { type: "text/calendar" });
const importFile = (file?: File, fields: Record<string, string> = {}) => addCalendarConnectionAction({}, form({ intent: "import", name: "Synthetic file", timezone: "UTC", ...fields }, file));
async function redirected(action: Promise<unknown>) {
  try { await action; } catch (error) { if (error instanceof Error && error.message.startsWith("REDIRECT ")) return new URL(error.message.slice("REDIRECT ".length), "https://app.invalid"); throw error; }
  throw new Error("The action did not redirect.");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.workspace.mockResolvedValue({ session: owner, user: { id: "owner" }, workspace: { id: "workspace-1" }, impersonation: null });
  mocks.count.mockResolvedValue(0);
  mocks.create.mockResolvedValue({ id: "connection-1" });
});

describe("connecting a calendar subscription", () => {
  it("returns each refusal to the form, saying the entries are kept, without creating a connection", async () => {
    for (const [fields, message] of [
      [{ name: "" }, "Give this calendar a name of up to 100 characters."],
      [{ name: "x".repeat(101) }, "Give this calendar a name of up to 100 characters."],
      [{ timezone: "Mars/Olympus" }, "Choose a valid timezone."],
      [{ url: "http://calendar.example/feed.ics" }, "Use an HTTPS calendar URL without a username, password, or custom port."],
      [{ url: "https://calendar.example:8443/feed.ics" }, "Use an HTTPS calendar URL without a username, password, or custom port."],
      [{ url: "not a url" }, "Use an HTTPS calendar URL without a username, password, or custom port."]
    ] as const) expect(await connect(fields)).toEqual({ error: `${message} ${KEPT}` });
    mocks.count.mockResolvedValue(20);
    expect(await connect()).toEqual({ error: `Connect up to 20 calendars. Disconnect one before adding another. ${KEPT}` });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  // A failed first refresh connects nothing (JITM-UXS-02, F-02).
  it("a failed first sync leaves no connection", async () => {
    mocks.create.mockResolvedValue({ id: "connection-new" });
    mocks.syncCalendar.mockRejectedValue(new UserFacingError(REFRESH_FAILED));
    expect(await connect()).toEqual({ error: `We couldn’t read that calendar link. Nothing was connected. Check the sharing URL and try again. ${KEPT}` });
    expect(mocks.create).toHaveBeenCalledWith({ data: { workspaceId: "workspace-1", name: "Work calendar", urlEncrypted: "encrypted", enabled: false, lastSyncedAt: null } });
    const created: { id: string } = await mocks.create.mock.results[0].value;
    expect(mocks.syncCalendar).toHaveBeenCalledWith("workspace-1", created.id, expect.any(Date), "pending");
    // Only the row this request created goes; no other connection is touched.
    expect(mocks.remove.mock.calls).toEqual([[{ where: { id: created.id } }]]);
    expect(mocks.removeMany).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("never shows an unexpected failure's text, and still leaves no connection", async () => {
    mocks.syncCalendar.mockRejectedValue(new Error("getaddrinfo ENOTFOUND calendar.internal"));
    expect(await connect()).toEqual({ error: `The calendar could not be updated. ${KEPT}` });
    expect(mocks.remove.mock.calls).toEqual([[{ where: { id: "connection-1" } }]]);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("names the calendar and the busy times it added", async () => {
    mocks.syncCalendar.mockResolvedValue(3);
    expect(await connect()).toEqual({ notice: "Connected Work calendar: 3 busy times added." });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    mocks.syncCalendar.mockResolvedValue(0);
    expect(await connect()).toEqual({ notice: "Connected Work calendar. It has no busy times from the past month through the next year." });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

// A refused cleanup never loses the refresh failure or leaves a working half-connection (DATA-01).
describe("when removing a failed connection is refused", () => {
  const cleanupRefused = new Error("synthetic cleanup refusal");
  let logged: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.create.mockResolvedValue({ id: "connection-new" });
    mocks.remove.mockRejectedValue(cleanupRefused);
    mocks.disable.mockResolvedValue({ count: 1 });
  });
  afterEach(() => logged.mockRestore());

  // Only the new row is removed, or else turned off with its link cleared: refreshes read enabled, linked connections alone.
  function expectOnlyTheNewRowTouched() {
    expect(mocks.remove.mock.calls).toEqual([[{ where: { id: "connection-new" } }]]);
    expect(mocks.disable.mock.calls).toEqual([[{ where: { id: "connection-new", workspaceId: "workspace-1" }, data: { enabled: false, urlEncrypted: null } }]]);
    expect(mocks.removeMany).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  }

  it("keeps a refused refresh's reply and turns the new row off", async () => {
    const refused = new UserFacingError(REFRESH_FAILED);
    mocks.syncCalendar.mockRejectedValue(refused);
    expect(await connect()).toEqual({ error: `We couldn’t read that calendar link. Nothing was connected. Check the sharing URL and try again. ${KEPT}` });
    expectOnlyTheNewRowTouched();
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0][1]).toEqual({ cause: refused, cleanup: cleanupRefused });
  });

  it("keeps an unexpected failure's fixed reply and logs it with the refused cleanup", async () => {
    const unexpected = new Error("getaddrinfo ENOTFOUND calendar.internal");
    mocks.syncCalendar.mockRejectedValue(unexpected);
    expect(await connect()).toEqual({ error: `The calendar could not be updated. ${KEPT}` });
    expectOnlyTheNewRowTouched();
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0][1]).toEqual({ cause: unexpected, cleanup: cleanupRefused });
  });

  it("still replies with the refresh failure when turning the row off is refused too", async () => {
    const refused = new UserFacingError(REFRESH_FAILED), disableRefused = new Error("synthetic disable refusal");
    mocks.syncCalendar.mockRejectedValue(refused);
    mocks.disable.mockRejectedValue(disableRefused);
    expect(await connect()).toEqual({ error: `We couldn’t read that calendar link. Nothing was connected. Check the sharing URL and try again. ${KEPT}` });
    expectOnlyTheNewRowTouched();
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0][1]).toEqual({ cause: refused, cleanup: cleanupRefused, disable: disableRefused });
    // The row both writes left behind was created turned off, and only a successful first refresh turns one on (FU1).
    expect(mocks.create.mock.calls[0][0].data.enabled).toBe(false);
    expect(mocks.syncCalendar.mock.calls[0][3]).toBe("pending");
  });

  it("keeps a refused import's reply and turns the new row off", async () => {
    const refused = new UserFacingError("Choose an iCalendar (.ics) file.");
    mocks.importCalendar.mockRejectedValue(refused);
    expect(await importFile(ics("Just some notes", "notes.txt"))).toEqual({ error: `Choose an iCalendar (.ics) file. ${KEPT}` });
    expectOnlyTheNewRowTouched();
    expect(logged.mock.calls[0][1]).toEqual({ cause: refused, cleanup: cleanupRefused });
  });
});

// The QA probe's five cases (JITM-UXS-02-FU1): what each leaves in the table, judged by what a refresh reads.
describe("a new connection is never usable for refresh until its first sync succeeds", () => {
  type Row = { id: string; workspaceId: string; name: string; urlEncrypted?: string | null; enabled: boolean; lastSyncedAt: Date | null };
  const earlier: Row = { id: "connection-earlier", workspaceId: "workspace-1", name: "Earlier calendar", urlEncrypted: "earlier-link", enabled: true, lastSyncedAt: new Date("2026-11-01T00:00:00Z") };
  const cleanupRefused = new Error("synthetic cleanup refusal"), disableRefused = new Error("synthetic disable refusal");
  let rows: Map<string, Row>, usableWhileFirstSyncRan: boolean[], logged: ReturnType<typeof vi.spyOn>;
  /** Every refresh path in calendar.ts (manual refresh, the worker's pass and import) reads only a turned-on row. */
  const usable = (id: string) => rows.get(id)?.enabled === true;
  /** The refresh contract of calendar.ts: a first sync reads only a pending row and turns it on when it succeeds; any other refresh reads only a turned-on row. */
  const readable = (row: Row | undefined, stage: unknown) => stage === "pending" ? row?.enabled === false && row.lastSyncedAt === null : row?.enabled === true;

  beforeEach(() => {
    logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    rows = new Map([[earlier.id, { ...earlier }]]);
    usableWhileFirstSyncRan = [];
    // The database applies the schema default (on) unless the request says otherwise.
    mocks.create.mockImplementation(async ({ data }: { data: Omit<Row, "id" | "enabled" | "lastSyncedAt"> & Partial<Row> }) => {
      const row: Row = { enabled: true, lastSyncedAt: null, ...data, id: "connection-new" };
      rows.set(row.id, row);
      return { ...row };
    });
  });
  afterEach(() => logged.mockRestore());

  /** Runs connect with the first sync failing (or not) and the cleanup writes refused (or not). */
  async function scenario(failure: Error | null, refuse: { delete?: boolean; disable?: boolean } = {}) {
    mocks.remove.mockImplementation(async ({ where }: { where: { id: string } }) => { if (refuse.delete) throw cleanupRefused; rows.delete(where.id); });
    mocks.disable.mockImplementation(async ({ where, data }: { where: { id: string; workspaceId: string }; data: Partial<Row> }) => {
      if (refuse.disable) throw disableRefused;
      const row = rows.get(where.id);
      if (!row || row.workspaceId !== where.workspaceId) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    });
    mocks.syncCalendar.mockImplementation(async (_workspaceId: string, id: string, now: Date | undefined, stage: unknown) => {
      if (id === "connection-new" && usableWhileFirstSyncRan.length === 0) usableWhileFirstSyncRan.push(usable(id));
      const row = rows.get(id);
      if (!readable(row, stage)) throw new UserFacingError("This calendar has no subscription URL.");
      if (failure && id === "connection-new" && row!.lastSyncedAt === null) throw failure;
      Object.assign(row!, { enabled: true, lastSyncedAt: now ?? new Date() });
      return 2;
    });
    return connect();
  }
  /** A later manual refresh of the new row: it works only on a usable connection. */
  async function refreshNewRow() {
    const location = await redirected(calendarConnectionAction(form({ intent: "sync", id: "connection-new" })));
    return location.search === "?saved=1";
  }
  function expectOnlyTheNewRowTouched() {
    expect(rows.get(earlier.id)).toEqual(earlier);
    for (const [where] of [...mocks.remove.mock.calls, ...mocks.disable.mock.calls]) expect(where.where.id).toBe("connection-new");
    expect(mocks.removeMany).not.toHaveBeenCalled();
  }
  const UNREADABLE = `We couldn’t read that calendar link. Nothing was connected. Check the sharing URL and try again. ${KEPT}`;

  it("normal delete: nothing is left", async () => {
    expect(await scenario(new UserFacingError(REFRESH_FAILED))).toEqual({ error: UNREADABLE });
    expect(usableWhileFirstSyncRan).toEqual([false]);
    expect(rows.has("connection-new")).toBe(false);
    expect(logged).not.toHaveBeenCalled();
    expectOnlyTheNewRowTouched();
  });

  it("delete refused: the row left is off and has no link", async () => {
    const refused = new UserFacingError(REFRESH_FAILED);
    expect(await scenario(refused, { delete: true })).toEqual({ error: UNREADABLE });
    expect(usableWhileFirstSyncRan).toEqual([false]);
    expect([usable("connection-new"), rows.get("connection-new")?.urlEncrypted]).toEqual([false, null]);
    expect(await refreshNewRow()).toBe(false);
    expect(logged.mock.calls.map((call: unknown[]) => call[1])).toEqual([{ cause: refused, cleanup: cleanupRefused }]);
    expectOnlyTheNewRowTouched();
  });

  it("both cleanup writes refused: the row left is still not usable, with the same reply and both errors logged", async () => {
    const refused = new UserFacingError(REFRESH_FAILED);
    expect(await scenario(refused, { delete: true, disable: true })).toEqual({ error: UNREADABLE });
    expect(usableWhileFirstSyncRan).toEqual([false]);
    expect(rows.has("connection-new")).toBe(true);
    expect(usable("connection-new")).toBe(false);
    expect(await refreshNewRow()).toBe(false);
    expect(logged.mock.calls.map((call: unknown[]) => call[1])).toEqual([{ cause: refused, cleanup: cleanupRefused, disable: disableRefused }]);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expectOnlyTheNewRowTouched();
  });

  it("unexpected sync failure: the fixed reply, and the row left is not usable", async () => {
    const unexpected = new Error("getaddrinfo ENOTFOUND calendar.internal");
    expect(await scenario(unexpected, { delete: true })).toEqual({ error: `The calendar could not be updated. ${KEPT}` });
    expect(usableWhileFirstSyncRan).toEqual([false]);
    expect(usable("connection-new")).toBe(false);
    expect(await refreshNewRow()).toBe(false);
    expect(logged.mock.calls.map((call: unknown[]) => call[1])).toEqual([{ cause: unexpected, cleanup: cleanupRefused }]);
    expectOnlyTheNewRowTouched();
  });

  it("success: one connection, turned on by its first sync, and later refreshes work", async () => {
    expect(await scenario(null)).toEqual({ notice: "Connected Work calendar: 2 busy times added." });
    expect(usableWhileFirstSyncRan).toEqual([false]);
    expect(usable("connection-new")).toBe(true);
    expect(rows.size).toBe(2);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.disable).not.toHaveBeenCalled();
    expect(await refreshNewRow()).toBe(true);
    expect(logged).not.toHaveBeenCalled();
    expectOnlyTheNewRowTouched();
  });
});

describe("importing a calendar file", () => {
  it("returns a missing, empty or oversized file to the form without creating a connection", async () => {
    for (const file of [undefined, ics(""), new File([new Uint8Array(900_001)], "big.ics", { type: "text/calendar" })]) {
      expect(await importFile(file)).toEqual({ error: `Choose an .ics file of up to 900 KB. ${KEPT}` });
    }
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("removes the connection for a file that is not a calendar and shows why in the form", async () => {
    mocks.importCalendar.mockRejectedValue(new UserFacingError("Choose an iCalendar (.ics) file."));
    expect(await importFile(ics("Just some notes", "notes.txt"))).toEqual({ error: `Choose an iCalendar (.ics) file. ${KEPT}` });
    expect(mocks.importCalendar).toHaveBeenCalledWith("workspace-1", "connection-1", "Just some notes", "UTC", expect.any(Date), "pending");
    expect(mocks.remove).toHaveBeenCalledWith({ where: { id: "connection-1" } });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("says what the file added, by name", async () => {
    mocks.importCalendar.mockResolvedValue(1);
    expect(await importFile(ics())).toEqual({ notice: "Imported Synthetic file: 1 busy time added." });
    expect(mocks.create).toHaveBeenCalledWith({ data: { workspaceId: "workspace-1", name: "Synthetic file", enabled: false, lastSyncedAt: null } });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    mocks.importCalendar.mockResolvedValue(1200);
    expect(await importFile(ics())).toEqual({ notice: "Imported Synthetic file: 1,200 busy times added." });
    mocks.importCalendar.mockResolvedValue(0);
    expect(await importFile(ics())).toEqual({ notice: "Imported Synthetic file. It has no busy times from the past month through the next year." });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("refuses an intent it does not handle and a view-only support session", async () => {
    expect(await addCalendarConnectionAction({}, form({ intent: "sync", name: "Work", timezone: "UTC" }))).toEqual({ error: `Choose a calendar action. ${KEPT}` });
    mocks.workspace.mockResolvedValue({ session: owner, user: { id: "owner" }, workspace: { id: "workspace-1" }, impersonation: { id: "support" } });
    await expect(importFile(ics())).rejects.toThrow("Support sessions are view-only.");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("the other connection intents are unchanged", () => {
  it("replaces, creates and disables the private link, then returns to the open panel", async () => {
    for (const intent of ["rotate", "subscribe"]) {
      const location = await redirected(calendarConnectionAction(form({ intent })));
      expect(location.pathname + location.search + location.hash).toBe("/calendar?saved=1#calendar-connections");
    }
    expect(mocks.preferenceUpsert).toHaveBeenCalledTimes(2);
    expect(mocks.preferenceUpsert).toHaveBeenCalledWith({ where: { workspaceId: "workspace-1" }, create: { workspaceId: "workspace-1", tokenHash: "hash", tokenEncrypted: "token" }, update: { tokenHash: "hash", tokenEncrypted: "token" } });
    expect((await redirected(calendarConnectionAction(form({ intent: "revoke" })))).search).toBe("?saved=1");
    expect(mocks.preferenceRemoveMany).toHaveBeenCalledWith({ where: { workspaceId: "workspace-1" } });
  });

  it("disconnects and refreshes only this workspace's connection, then returns to the open panel", async () => {
    expect((await redirected(calendarConnectionAction(form({ intent: "disconnect", id: "connection-9" })))).hash).toBe("#calendar-connections");
    expect(mocks.removeMany).toHaveBeenCalledWith({ where: { id: "connection-9", workspaceId: "workspace-1" } });
    expect((await redirected(calendarConnectionAction(form({ intent: "sync", id: "connection-9" })))).search).toBe("?saved=1");
    expect(mocks.syncCalendar).toHaveBeenCalledWith("workspace-1", "connection-9");
    mocks.syncCalendar.mockRejectedValue(new UserFacingError("This calendar was just refreshed. Try again in a minute."));
    const refused = await redirected(calendarConnectionAction(form({ intent: "sync", id: "connection-9" })));
    expect([refused.pathname, refused.hash, viewerErrorMessage(Object.fromEntries(refused.searchParams), owner)]).toEqual(["/calendar", "#calendar-connections", "This calendar was just refreshed. Try again in a minute."]);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("sends connect and import to the form's own action", async () => {
    for (const intent of ["connect", "import"]) {
      const refused = await redirected(calendarConnectionAction(form({ intent, name: "Work", timezone: "UTC", url: "https://calendar.example/feed.ics" })));
      expect(viewerErrorMessage(Object.fromEntries(refused.searchParams), owner)).toBe("Choose a calendar action.");
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
