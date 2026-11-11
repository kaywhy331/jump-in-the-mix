import { createHash, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { CALENDAR_CONNECTION_STAGES } from "../src/lib/calendar-connection-stages";
import { applyRenderedTheme } from "./theme-fixture";

// Connecting or importing a calendar answers inside the open form: an error keeps every entry and
// takes focus, and a success names what was added; the page never reloads (JITM-UXS-01, F-01, F-14).
const database = new URL(process.env.DATABASE_URL ?? "postgresql://localhost/unknown");
test.skip(!["localhost", "127.0.0.1"].includes(database.hostname) || !database.pathname.startsWith("/jitm_design_"), "Disposable fixtures only");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block", actionTimeout: 15_000 });
test.setTimeout(420_000);

const output = ".artifacts/uxs01";
/** The slice's sizes: a phone and a desktop. */
const SIZES = [{ width: 390, height: 844 }, { width: 1440, height: 900 }] as const;
const KEPT = "Your entries are kept.";
const WCAG = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
const CONNECT = "Connect a calendar subscription", IMPORT = "Import a calendar file";
let userId: string, workspaceId: string;

test.beforeEach(async ({ context }) => {
  userId = (await prisma.user.create({ data: { name: "Casey Example", email: `calendar-${randomUUID()}@example.test`, emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Calendar connections fixture", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true, company: "Example Repairs", smsSignature: "Casey", emailSignature: "Casey" } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  const token = randomUUID();
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  await context.addCookies([{ name: "jitm_session", value: token, url: process.env.PLAYWRIGHT_BASE_URL ?? process.env.APP_URL!, httpOnly: true, sameSite: "Lax" }]);
  await mkdir(output, { recursive: true });
});
test.afterEach(async () => {
  await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

/** Calendar, once the browser session check has let go of the page (it is inert until then). */
async function gotoCalendar(page: Page, colorScheme: "light" | "dark", size: { width: number; height: number }) {
  await page.goto("/calendar");
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
  await applyRenderedTheme(page, colorScheme, size);
}

/** Opens Calendar with the connections panel and one of its sub-panels open. */
async function openForm(page: Page, subPanel: typeof CONNECT | typeof IMPORT, colorScheme: "light" | "dark", size: { width: number; height: number }) {
  await gotoCalendar(page, colorScheme, size);
  const panel = page.locator("#calendar-connections");
  await panel.locator(":scope > summary").click();
  const sub = panel.locator("details").filter({ has: page.locator("summary", { hasText: subPanel }) });
  await sub.locator(":scope > summary").click();
  await expect(sub).toHaveAttribute("open", "");
  // Anything that replaces the document drops this marker.
  await page.evaluate(() => { (window as unknown as { calendarFormMarker: string }).calendarFormMarker = "kept"; });
  return { panel, sub, form: sub.locator("form"), url: page.url() };
}

/** The reply is inside the form, visible, not covered, focused, and the page did not reload or close a panel. */
async function expectReply(page: Page, opened: Awaited<ReturnType<typeof openForm>>, role: "alert" | "status", text: string, label: string) {
  const reply = opened.form.getByRole(role);
  await expect(reply, label).toHaveText(text);
  await expect(reply, label).toBeInViewport();
  expect(await reply.evaluate(node => {
    const box = node.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { focused: document.activeElement === node || document.activeElement === node.parentElement, uncovered: Boolean(top && node.contains(top)) };
  }), label).toEqual({ focused: true, uncovered: true });
  expect(await page.evaluate(() => (window as unknown as { calendarFormMarker?: string }).calendarFormMarker), `${label}: no document navigation`).toBe("kept");
  expect(page.url(), label).toBe(opened.url);
  await expect(opened.panel, label).toHaveAttribute("open", "");
  await expect(opened.sub, label).toHaveAttribute("open", "");
}

/** Focuses a disclosure's summary and opens it with Enter, retrying only if focus did not land on it. */
async function openByKeyboard(page: Page, details: ReturnType<Page["locator"]>, label: string) {
  const summary = details.locator(":scope > summary");
  await expect(async () => {
    if (await details.getAttribute("open") === null) {
      await summary.focus();
      await expect(summary).toBeFocused({ timeout: 1_000 });
      await page.keyboard.press("Enter");
    }
    await expect(details).toHaveAttribute("open", "", { timeout: 1_000 });
  }, label).toPass({ timeout: 10_000 });
}

async function expectNoSidewaysScroll(page: Page, label: string) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), label).toBeLessThanOrEqual(1);
}

/** The open connections panel, with its reply, passes the automated WCAG checks. */
async function expectAccessiblePanel(page: Page, label: string) {
  expect((await new AxeBuilder({ page }).include("#calendar-connections").withTags(WCAG).analyze()).violations, label).toEqual([]);
}

/** A PNG written to the artifacts folder and checked by its header, never opened (CA5). */
async function capture(page: Page, name: string) {
  const path = `${output}/${name}.png`;
  await page.screenshot({ path });
  const png = await readFile(path);
  expect(png.subarray(1, 4).toString(), name).toBe("PNG");
  expect(png.readUInt32BE(16) * png.readUInt32BE(20), name).toBeGreaterThan(0);
}

function icsFile(start: Date) {
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const end = new Date(start.getTime() + 3600_000);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Example//Synthetic calendar//EN", "BEGIN:VEVENT", `UID:${randomUUID()}@example.test`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, "SUMMARY:Synthetic busy time", "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
}

test("a bad calendar URL or file shows its error inside the open form and keeps every entry; a file that imports says what it added", async ({ page }) => {
  for (const colorScheme of ["light", "dark"] as const) {
    for (const size of SIZES) {
      const at = `${colorScheme} ${size.width}`;
      await prisma.calendarConnection.deleteMany({ where: { workspaceId } });

      for (const [url, message, name] of [
        ["http://calendar.example/feed.ics", "Use an HTTPS calendar URL without a username, password, or custom port.", "http"],
        // A host that never resolves stands in for a feed the app cannot reach.
        ["https://calendar.invalid/feed.ics", "We couldn’t read that calendar link. Nothing was connected. Check the sharing URL and try again.", "unreachable"]
      ] as const) {
        const opened = await openForm(page, CONNECT, colorScheme, size);
        await opened.form.getByLabel("Calendar name", { exact: true }).fill("Work calendar");
        await opened.form.getByLabel("iCalendar subscription URL", { exact: true }).fill(url);
        await opened.form.getByRole("button", { name: "Connect calendar", exact: true }).click();
        await expectReply(page, opened, "alert", `${message} ${KEPT}`, `${at} ${name} URL`);
        await expect(opened.form.getByLabel("Calendar name", { exact: true })).toHaveValue("Work calendar");
        await expect(opened.form.getByLabel("iCalendar subscription URL", { exact: true })).toHaveValue(url);
        // Neither refusal leaves a connection behind; a failed first refresh removes the one it made (JITM-UXS-02).
        expect(await prisma.calendarConnection.count({ where: { workspaceId } }), `${at} ${name} URL: nothing was connected`).toBe(0);
        await expectNoSidewaysScroll(page, `${at} ${name} URL`);
        if (name === "http") { await capture(page, `connect-error-${colorScheme}-${size.width}`); await expectAccessiblePanel(page, `${at} connect error`); }
      }

      for (const [file, message, name] of [
        [{ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Just some notes, not a calendar.") }, "Choose an iCalendar (.ics) file.", "non-iCalendar file"],
        [{ name: "large.ics", mimeType: "text/calendar", buffer: Buffer.alloc(950_000, "A") }, "Choose an .ics file of up to 900 KB.", "file over 900 KB"]
      ] as const) {
        const opened = await openForm(page, IMPORT, colorScheme, size);
        await opened.form.getByLabel("Imported calendar name", { exact: true }).fill("Synthetic file");
        await opened.form.getByLabel("iCalendar file", { exact: true }).setInputFiles(file);
        await opened.form.getByRole("button", { name: "Import availability", exact: true }).click();
        await expectReply(page, opened, "alert", `${message} ${KEPT}`, `${at} ${name}`);
        await expect(opened.form.getByLabel("Imported calendar name", { exact: true })).toHaveValue("Synthetic file");
        expect(await opened.form.getByLabel("iCalendar file", { exact: true }).evaluate(input => (input as HTMLInputElement).files?.[0]?.name), `${at} ${name}: the chosen file stays`).toBe(file.name);
        await expectNoSidewaysScroll(page, `${at} ${name}`);
        if (name === "non-iCalendar file") { await capture(page, `import-error-${colorScheme}-${size.width}`); await expectAccessiblePanel(page, `${at} import error`); }
      }

      const opened = await openForm(page, IMPORT, colorScheme, size);
      await opened.form.getByLabel("Imported calendar name", { exact: true }).fill("Synthetic file");
      await opened.form.getByLabel("iCalendar file", { exact: true }).setInputFiles({ name: "synthetic.ics", mimeType: "text/calendar", buffer: Buffer.from(icsFile(new Date(Date.now() + 2 * 86_400_000))) });
      await opened.form.getByRole("button", { name: "Import availability", exact: true }).click();
      await expectReply(page, opened, "status", "Imported Synthetic file: 1 busy time added.", `${at} success`);
      await expect(opened.panel.getByRole("heading", { name: "Synthetic file", exact: true }), `${at} the new calendar is listed`).toBeVisible();
      await expect(opened.form.getByLabel("Imported calendar name", { exact: true }), `${at} a fresh form after success`).toHaveValue("");
      await expect(page.getByText("Calendar updated.", { exact: true })).toHaveCount(0);
      await capture(page, `import-success-${colorScheme}-${size.width}`);
      await expectAccessiblePanel(page, `${at} import success`);
      expect(await prisma.calendarEntry.count({ where: { workspaceId, connection: { name: "Synthetic file" } } })).toBe(1);
    }
  }
});

test("the in-form error holds by keyboard, across the layout boundaries, on short screens, at 200% text and at 110% zoom", async ({ page }) => {
  const viewports = [{ width: 390, height: 844 }, { width: 900, height: 900 }, { width: 901, height: 900 }, { width: 1099, height: 900 }, { width: 1100, height: 900 }, { width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 1440, height: 480 }];
  const message = `Use an HTTPS calendar URL without a username, password, or custom port. ${KEPT}`;
  for (const colorScheme of ["light", "dark"] as const) {
    for (const viewport of viewports) {
      const at = `${colorScheme} ${viewport.width}×${viewport.height}`;
      await gotoCalendar(page, colorScheme, viewport);
      const panel = page.locator("#calendar-connections");
      // Opened, filled and sent from the keyboard alone.
      await openByKeyboard(page, panel, at);
      const sub = panel.locator("details").filter({ has: page.locator("summary", { hasText: CONNECT }) });
      await openByKeyboard(page, sub, at);
      const opened = { panel, sub, form: sub.locator("form"), url: page.url() };
      await page.evaluate(() => { (window as unknown as { calendarFormMarker: string }).calendarFormMarker = "kept"; });
      await page.keyboard.press("Tab");
      await expect(opened.form.getByLabel("Calendar name", { exact: true }), at).toBeFocused();
      await page.keyboard.type("Work calendar");
      await page.keyboard.press("Tab");
      await page.keyboard.type("http://calendar.example/feed.ics");
      await page.keyboard.press("Enter");
      await expectReply(page, opened, "alert", message, at);
      await expectNoSidewaysScroll(page, at);
      // From the error, Tab returns to the first entry, still filled.
      await page.keyboard.press("Tab");
      await expect(opened.form.getByLabel("Calendar name", { exact: true }), at).toBeFocused();
      await expect(opened.form.getByLabel("Calendar name", { exact: true }), at).toHaveValue("Work calendar");
    }
    for (const [label, size, style] of [["200% text", { width: 390, height: 844 }, "fontSize"], ["110% zoom", { width: 1100, height: 900 }, "zoom"]] as const) {
      const opened = await openForm(page, CONNECT, colorScheme, size);
      await page.evaluate(([property]) => { document.documentElement.style[property] = property === "zoom" ? "1.1" : "200%"; }, [style] as const);
      if (style === "zoom") expect(await page.evaluate(() => window.innerWidth / Number(getComputedStyle(document.documentElement).zoom)), "110% zoom gives a fractional width").not.toBe(size.width);
      await opened.form.getByLabel("Calendar name", { exact: true }).fill("Work calendar");
      await opened.form.getByLabel("iCalendar subscription URL", { exact: true }).fill("http://calendar.example/feed.ics");
      await opened.form.getByRole("button", { name: "Connect calendar", exact: true }).click();
      await expectReply(page, opened, "alert", message, `${colorScheme} ${label}`);
      await expectNoSidewaysScroll(page, `${colorScheme} ${label}`);
    }
  }
});

// A connection whose first refresh failed, and whose removal was refused, stays pending. Calendar lists it as
// not connected, with Remove and no Refresh now, and Remove takes only that calendar (JITM-UXS-02-FU2).
test("a calendar left pending is listed as not connected, with Remove and no Refresh now, and Remove takes only it", async ({ page }) => {
  const NOT_CONNECTED_HELP = "Adding this calendar didn’t finish. Remove it, then add the calendar again.";
  const LEFTOVER_ERROR = "Synthetic first refresh failure.";
  for (const colorScheme of ["light", "dark"] as const) {
    for (const [label, size, largeText] of [...SIZES.map(size => [`${size.width}`, size, false] as const), ["200% text", SIZES[0], true] as const]) {
      const at = `${colorScheme} ${label}`;
      await prisma.calendarConnection.deleteMany({ where: { workspaceId } });
      const syncedAt = new Date();
      const connected = await prisma.calendarConnection.create({ data: { workspaceId, name: "Work subscription", urlEncrypted: "test-only", ...CALENDAR_CONNECTION_STAGES.connected, lastSyncedAt: syncedAt, lastAttemptAt: syncedAt } });
      const leftover = await prisma.calendarConnection.create({ data: { workspaceId, name: "Leftover subscription", urlEncrypted: "test-only", lastAttemptAt: syncedAt, lastError: LEFTOVER_ERROR, ...CALENDAR_CONNECTION_STAGES.pending } });
      const leftoverFile = await prisma.calendarConnection.create({ data: { workspaceId, name: "Leftover file", ...CALENDAR_CONNECTION_STAGES.pending } });

      await gotoCalendar(page, colorScheme, size);
      if (largeText) await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      const panel = page.locator("#calendar-connections");
      await openByKeyboard(page, panel, at);
      const row = (name: string) => panel.locator(".connection-row").filter({ has: page.getByRole("heading", { name, exact: true }) });

      for (const [name, kind] of [["Leftover subscription", "Subscription"], ["Leftover file", "Imported file"]] as const) {
        await expect(row(name).getByText(`${kind} · Not connected`, { exact: true }), `${at} ${name}: labelled not connected`).toBeVisible();
        await expect(row(name).getByText(NOT_CONNECTED_HELP, { exact: true }), `${at} ${name}: says what to do`).toBeVisible();
        await expect(row(name).getByRole("button", { name: "Refresh now" }), `${at} ${name}: no refresh`).toHaveCount(0);
        await expect(row(name).getByRole("button", { name: "Disconnect…", exact: true }), `${at} ${name}: removed, not disconnected`).toHaveCount(0);
        await expect(row(name).getByRole("button", { name: "Remove…", exact: true }), `${at} ${name}: can be removed`).toBeVisible();
      }
      await expect(row("Leftover subscription").getByText(LEFTOVER_ERROR), `${at}: no refresh error for a calendar that is not connected`).toHaveCount(0);
      // The connected calendar is listed as before.
      await expect(row("Work subscription").getByText(/^Subscription · Last updated /), `${at}: connected row`).toBeVisible();
      await expect(row("Work subscription").getByText("Not connected"), `${at}: connected row`).toHaveCount(0);
      await expect(row("Work subscription").getByRole("button", { name: "Refresh now", exact: true }), `${at}: connected row refreshes`).toBeEnabled();
      await expect(row("Work subscription").getByRole("button", { name: "Disconnect…", exact: true }), `${at}: connected row disconnects`).toBeVisible();
      // Only connected availability can be out of date; the connected one was just refreshed.
      await expect(page.getByText("Some connected availability may be out of date.", { exact: false }), `${at}: no out-of-date notice`).toHaveCount(0);
      await expectNoSidewaysScroll(page, at);
      await expectAccessiblePanel(page, at);
      if (!largeText) await capture(page, `pending-row-${colorScheme}-${size.width}`);

      // Removed from the keyboard alone: Enter opens the confirmation on Cancel, Tab reaches Remove calendar.
      const trigger = row("Leftover subscription").getByRole("button", { name: "Remove…", exact: true });
      await trigger.focus();
      await expect(trigger, at).toBeFocused();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Remove Leftover subscription?" });
      await expect(dialog, at).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Cancel", exact: true }), `${at}: Cancel first`).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(dialog.getByRole("button", { name: "Remove calendar", exact: true }), at).toBeFocused();
      await page.keyboard.press("Enter");
      await page.waitForURL(url => url.pathname === "/calendar" && url.searchParams.get("saved") === "1");
      await expect(page.locator("#calendar-connections .connection-row").filter({ has: page.getByRole("heading", { name: "Leftover subscription", exact: true }) }), `${at}: no longer listed`).toHaveCount(0);
      expect((await prisma.calendarConnection.findMany({ where: { workspaceId }, select: { id: true } })).map(({ id }) => id).sort(), `${at}: Remove took only that calendar`).toEqual([connected.id, leftoverFile.id].sort());
      expect(await prisma.calendarConnection.findUnique({ where: { id: leftover.id } }), at).toBeNull();
    }
  }
});
