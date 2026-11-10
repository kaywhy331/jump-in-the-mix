import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A new calendar connection is unusable for refresh until its first sync succeeds (JITM-UXS-02-FU1,
// DATA-01): every refresh path ignores a pending row, and only the first sync or import that the
// creating request runs turns it on, together with its busy times. Rows saved earlier keep working.
const feeds = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/calendar-feed-fetch", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/calendar-feed-fetch")>(), fetchCalendarFeed: feeds.fetch }));

import { prisma } from "@/lib/prisma";
import { importCalendar, runCalendarSync, syncCalendarConnection } from "@/lib/calendar";
import { CALENDAR_CONNECTION_STAGES } from "@/lib/calendar-connection-stages";
import { encryptIntegrationCredentials } from "@/lib/integration-crypto";

// These tests write committed rows. They must never run on a hosted or shared business database.
const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local || !process.env.DATA_ENCRYPTION_KEY)("calendar connections stay pending until their first sync", () => {
  const NOW = new Date("2026-11-10T12:00:00Z");
  const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
  let workspaceId: string, userId: string;

  function calendar() {
    const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const start = later(2 * 24 * 60), end = later(2 * 24 * 60 + 60);
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Example//Synthetic calendar//EN", "BEGIN:VEVENT", `UID:${randomUUID()}@example.test`, `DTSTAMP:${stamp(NOW)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, "SUMMARY:Synthetic busy time", "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
  }
  const link = (name: string) => encryptIntegrationCredentials({ url: `https://calendar.example/${name}.ics`, timezone: "UTC" });
  /** A subscription saved before this change: created with the schema default, already synced. */
  const earlierSubscription = () => prisma.calendarConnection.create({ data: { workspaceId, name: "Earlier subscription", urlEncrypted: link("earlier"), lastSyncedAt: later(-60), lastAttemptAt: later(-60) } });
  /** A new subscription or file, created the way connect and import create one. */
  const pendingConnection = (name: string, subscription = true) => prisma.calendarConnection.create({ data: { workspaceId, name, ...(subscription ? { urlEncrypted: link(name) } : {}), ...CALENDAR_CONNECTION_STAGES.pending } });
  const row = (id: string) => prisma.calendarConnection.findUniqueOrThrow({ where: { id } });
  const busyTimes = (connectionId: string) => prisma.calendarEntry.count({ where: { workspaceId, connectionId } });

  beforeEach(async () => {
    feeds.fetch.mockReset();
    const suffix = randomUUID();
    userId = (await prisma.user.create({ data: { email: `calendar-stages-${suffix}@example.test`, name: "Calendar stages test", passwordHash: "test-only" } })).id;
    workspaceId = (await prisma.workspace.create({ data: { name: "Calendar stages test", slug: `calendar-stages-${suffix}`, ownerId: userId } })).id;
  });
  afterEach(async () => {
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("every refresh path ignores a pending connection", async () => {
    const pending = await pendingConnection("pending");
    const file = await pendingConnection("pending-file", false);
    const before = [await row(pending.id), await row(file.id)];
    feeds.fetch.mockResolvedValue(calendar());
    await expect(syncCalendarConnection(workspaceId, pending.id, NOW)).rejects.toThrow("This calendar has no subscription URL.");
    await expect(importCalendar(workspaceId, pending.id, calendar(), "UTC", NOW)).rejects.toThrow("This calendar connection is unavailable.");
    await expect(importCalendar(workspaceId, file.id, calendar(), "UTC", NOW)).rejects.toThrow("This calendar connection is unavailable.");
    await runCalendarSync(NOW);
    expect(feeds.fetch.mock.calls.map(([url]) => url)).not.toContain("https://calendar.example/pending.ics");
    expect([await row(pending.id), await row(file.id)]).toEqual(before);
    expect([await busyTimes(pending.id), await busyTimes(file.id)]).toEqual([0, 0]);
  });

  it("a failed first sync leaves the connection pending and changes no other row", async () => {
    const earlier = await earlierSubscription(), pending = await pendingConnection("unreachable");
    const earlierBefore = await row(earlier.id);
    feeds.fetch.mockRejectedValue(new Error("getaddrinfo ENOTFOUND calendar.invalid"));
    await expect(syncCalendarConnection(workspaceId, pending.id, NOW, "pending")).rejects.toThrow("Could not refresh this calendar.");
    expect(await row(pending.id)).toMatchObject({ ...CALENDAR_CONNECTION_STAGES.pending, lastAttemptAt: NOW });
    expect(await busyTimes(pending.id)).toBe(0);
    // Nothing can take it up later: a refresh reads only connections that are on.
    feeds.fetch.mockResolvedValue(calendar());
    await expect(syncCalendarConnection(workspaceId, pending.id, later(2))).rejects.toThrow("This calendar has no subscription URL.");
    expect(await row(pending.id)).toMatchObject(CALENDAR_CONNECTION_STAGES.pending);
    expect(await row(earlier.id)).toEqual(earlierBefore);
  });

  it("a successful first sync turns on only its own connection, and later refreshes work", async () => {
    const earlier = await earlierSubscription(), pending = await pendingConnection("reachable");
    const earlierBefore = await row(earlier.id);
    feeds.fetch.mockResolvedValue(calendar());
    expect(await syncCalendarConnection(workspaceId, pending.id, NOW, "pending")).toBe(1);
    expect(await row(pending.id)).toMatchObject({ enabled: true, lastSyncedAt: NOW, lastAttemptAt: NOW, lastError: null });
    expect(await busyTimes(pending.id)).toBe(1);
    expect(await row(earlier.id)).toEqual(earlierBefore);
    // Once on, it is an ordinary connection: refreshes take it, and a first sync no longer can.
    expect(await syncCalendarConnection(workspaceId, pending.id, later(2))).toBe(1);
    expect(await row(pending.id)).toMatchObject({ enabled: true, lastSyncedAt: later(2) });
    await expect(syncCalendarConnection(workspaceId, pending.id, later(4), "pending")).rejects.toThrow("This calendar has no subscription URL.");
    expect(await prisma.calendarConnection.count({ where: { workspaceId } })).toBe(2);
  });

  it("a first import turns on only its own file, and never a connection saved earlier", async () => {
    const earlier = await earlierSubscription(), file = await pendingConnection("file", false);
    const earlierBefore = await row(earlier.id);
    await expect(importCalendar(workspaceId, earlier.id, calendar(), "UTC", NOW, "pending")).rejects.toThrow("This calendar connection is unavailable.");
    await expect(importCalendar(workspaceId, file.id, "not a calendar", "UTC", NOW, "pending")).rejects.toThrow();
    expect(await row(file.id)).toMatchObject(CALENDAR_CONNECTION_STAGES.pending);
    expect(await importCalendar(workspaceId, file.id, calendar(), "UTC", NOW, "pending")).toBe(1);
    expect(await row(file.id)).toMatchObject({ enabled: true, lastSyncedAt: NOW, urlEncrypted: null });
    expect(await busyTimes(file.id)).toBe(1);
    expect(await row(earlier.id)).toEqual(earlierBefore);
    expect(await busyTimes(earlier.id)).toBe(0);
  });

  it("connections saved before this change keep refreshing as before", async () => {
    const earlier = await earlierSubscription();
    feeds.fetch.mockResolvedValue(calendar());
    expect(await syncCalendarConnection(workspaceId, earlier.id, NOW)).toBe(1);
    expect(await row(earlier.id)).toMatchObject({ enabled: true, lastSyncedAt: NOW, lastAttemptAt: NOW, lastError: null });
    expect(feeds.fetch).toHaveBeenCalledWith("https://calendar.example/earlier.ics");
  });
});
