import { beforeEach, describe, expect, it, vi } from "vitest";

// Connect and import answer the open form with an error or what was added (JITM-UXS-01, F-01, F-14);
// the other connection intents still return to the calendar as before.
const mocks = vi.hoisted(() => ({
  workspace: vi.fn(), refresh: vi.fn(),
  count: vi.fn(), create: vi.fn(), remove: vi.fn(), removeMany: vi.fn(),
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
  calendarConnection: { count: mocks.count, create: mocks.create, delete: mocks.remove, deleteMany: mocks.removeMany },
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

  it("shows an unreachable feed's refusal in the form and lists the connection it kept", async () => {
    mocks.syncCalendar.mockRejectedValue(new UserFacingError(REFRESH_FAILED));
    expect(await connect()).toEqual({ error: `${REFRESH_FAILED} ${KEPT}` });
    expect(mocks.create).toHaveBeenCalledWith({ data: { workspaceId: "workspace-1", name: "Work calendar", urlEncrypted: "encrypted" } });
    expect(mocks.syncCalendar).toHaveBeenCalledWith("workspace-1", "connection-1");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("never shows an unexpected failure's text", async () => {
    mocks.syncCalendar.mockRejectedValue(new Error("getaddrinfo ENOTFOUND calendar.internal"));
    expect(await connect()).toEqual({ error: `The calendar could not be updated. ${KEPT}` });
  });

  it("names the calendar and the busy times it added", async () => {
    mocks.syncCalendar.mockResolvedValue(3);
    expect(await connect()).toEqual({ notice: "Connected Work calendar: 3 busy times added." });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    mocks.syncCalendar.mockResolvedValue(0);
    expect(await connect()).toEqual({ notice: "Connected Work calendar. It has no busy times from the past month through the next year." });
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
    expect(mocks.importCalendar).toHaveBeenCalledWith("workspace-1", "connection-1", "Just some notes", "UTC");
    expect(mocks.remove).toHaveBeenCalledWith({ where: { id: "connection-1" } });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("says what the file added, by name", async () => {
    mocks.importCalendar.mockResolvedValue(1);
    expect(await importFile(ics())).toEqual({ notice: "Imported Synthetic file: 1 busy time added." });
    expect(mocks.create).toHaveBeenCalledWith({ data: { workspaceId: "workspace-1", name: "Synthetic file" } });
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
