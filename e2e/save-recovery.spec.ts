import { createHash, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off" });
let userId: string, workspaceId: string, contactId: string;
const token = randomUUID();
test.beforeAll(async () => {
  const suffix = randomUUID();
  userId = (await prisma.user.create({ data: { email: `recovery-${suffix}@example.test`, name: "Save recovery fixture", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: suffix, name: "Recovery fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  contactId = (await prisma.contact.create({ data: { workspaceId, displayName: "Recovery fixture person", relationshipState: { create: { workspaceId, priority: "NORMAL" } } } })).id;
  await prisma.calendarEntry.create({ data: { workspaceId, contactId, title: "Existing fixture event", kind: "MEETING", startsAt: new Date("2027-10-15T10:00:00Z"), endsAt: new Date("2027-10-15T10:30:00Z"), timezone: "UTC" } });
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});
const ready = (page: Page) => expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
async function capture(page: Page, review = true) {
  await page.goto("/contacts"); await ready(page);
  await page.getByRole("button", { name: "Quick Add", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Quick Add", exact: true });
  await dialog.getByLabel("What do you want to remember?").fill(`Add Fictional recovery ${randomUUID().replaceAll("-", "").slice(0, 12).replace(/\d/g, d => String.fromCharCode(107 + Number(d)))}`);
  if (review) await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  return dialog;
}

test("Calendar warns before filters replace a draft and preserves it during contact search", async ({ page }) => {
  await page.goto("/calendar?new=1&date=2027-10-15"); await ready(page);
  const title = page.getByRole("textbox", { name: "Title", exact: true });
  // Text typed before the form guard takes its first snapshot counts as the saved state, so type until it reports the draft.
  const guard = page.locator(".calendar-entry-form .form-guard-status");
  let attempt = 0;
  await expect(async () => { await title.fill(`Draft ${++attempt}`); await expect(guard).toHaveText(/Unsaved changes/, { timeout: 1_000 }); }).toPass();
  await title.fill("Keep this new event");
  await expect(guard).toHaveText(/Unsaved changes/);
  await page.locator(".calendar-filter-options > summary").click();
  const prompts: string[] = []; let leave = false;
  page.on("dialog", async prompt => { prompts.push(prompt.type()); if (leave) await prompt.accept(); else await prompt.dismiss(); });
  await page.getByLabel("Starting date", { exact: true }).fill("2027-10-16");
  await expect.poll(() => prompts).toEqual(["confirm"]);
  await expect(page).toHaveURL(/date=2027-10-15/);
  await expect(page.getByLabel("Starting date", { exact: true })).toHaveValue("2027-10-15");
  await expect(title).toHaveValue("Keep this new event");
  await page.getByRole("combobox", { name: "Contact (optional)", exact: true }).selectOption(contactId);
  await page.getByText("Find a contact for this event", { exact: true }).click();
  await page.getByRole("searchbox", { name: "Find a calendar contact", exact: true }).fill("No matching people");
  await expect(page).toHaveURL(/q=No/); await ready(page);
  expect(new URL(page.url()).searchParams.get("new")).toBe("1");
  await expect(page.getByRole("combobox", { name: "Contact (optional)", exact: true })).toHaveValue(contactId);
  await expect(title).toHaveValue("Keep this new event");
  await expect(page.getByRole("button", { name: "Save event", exact: true })).toBeVisible();
  if (!(await page.getByLabel("Starting date", { exact: true }).isVisible())) await page.locator(".calendar-filter-options > summary").click();
  leave = true;
  await page.getByLabel("Starting date", { exact: true }).fill("2027-10-16");
  await expect(page).toHaveURL(/date=2027-10-16/);
  await expect(title).toHaveValue("");
});

test("Calendar locks the submitted snapshot until saving finishes", async ({ page }) => {
  await page.goto("/calendar?new=1&date=2027-10-17"); await ready(page);
  const title = page.getByRole("textbox", { name: "Title", exact: true });
  await title.fill("Submitted once");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/calendar**", async route => { if (route.request().method() === "POST") await gate; await route.continue(); });
  try {
    await page.getByRole("button", { name: "Save event", exact: true }).click();
    await expect(title).toBeDisabled();
    await expect(page.getByRole("button", { name: "30 min", exact: true })).toBeDisabled();
  } finally { release(); }
  await expect(page).toHaveURL(/saved=1/);
  expect(await prisma.calendarEntry.count({ where: { workspaceId, title: "Submitted once" } })).toBe(1);
});

test("contact preferences wait for the saved version before accepting another change", async ({ page }) => {
  await page.goto(`/contacts/${contactId}`); await ready(page);
  await page.locator("#dates-and-mixes > summary").click();
  await page.route("**/contacts/**", async route => { if (route.request().method() === "POST") await new Promise(resolve => setTimeout(resolve, 500)); await route.continue(); });
  await page.locator(".relationship-chip").filter({ hasText: /^High$/ }).click();
  await expect(page.getByRole("radio", { name: "Email", exact: true })).toBeDisabled();
  await expect(page.getByText("Saving preferences…", { exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Email", exact: true })).toBeEnabled();
  await page.locator(".relationship-chip").filter({ hasText: /^Email$/ }).click();
  await expect.poll(async () => {
    const saved = await prisma.contactRelationshipState.findUniqueOrThrow({ where: { contactId } });
    return { priority: saved.priority, preferredChannel: saved.preferredChannel };
  }).toEqual({ priority: "HIGH", preferredChannel: "EMAIL" });
  await expect(page.locator(".notice.error")).toHaveCount(0);
});

test("Quick Add recovers a committed save after a lost response without discarding later edits", async ({ page }, info) => {
  const dialog = await capture(page);
  let dropped = false, savedContactId = "";
  const keys: string[] = [];
  await page.route("**/api/quick-capture", async route => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().postDataJSON().requestId);
    if (!dropped) { dropped = true; const response = await route.fetch(); expect(response.ok()).toBe(true); savedContactId = (await response.json()).receipt.contactId; await route.abort("failed"); }
    else await route.continue();
  });
  await dialog.getByRole("button", { name: "Save all 2", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("couldn’t confirm");
  await dialog.getByLabel("Name or search for someone").fill("Later unsaved name");
  await dialog.getByRole("button", { name: "Save all 2", exact: true }).click();
  await expect(dialog.getByRole("link", { name: "Open saved person" })).toHaveAttribute("href", `/contacts/${savedContactId}`);
  await expect(dialog.getByLabel("Name or search for someone")).toHaveValue("Later unsaved name");
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
  expect(await prisma.contact.count({ where: { workspaceId, displayName: "Later unsaved name" } })).toBe(0);
  await expect(dialog.getByRole("button", { name: "Save all 2", exact: true })).toBeDisabled();
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    // Only time-based animations settle; the scroll-linked edge fades on sideways strips never finish on their own.
    await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.timeline === document.timeline).map(a => a.finished.catch(() => undefined))));
    expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.artifacts/recovery-release-20260920/recovery-${info.project.name}-${theme}.png` });
  }
  // Leaving asks in the app's confirmation dialog (not window.confirm): Cancel keeps the later edits in Quick Add.
  const leave = page.getByRole("dialog", { name: "Leave without applying your later edits?", exact: true });
  await dialog.getByRole("link", { name: "Open saved person" }).click();
  await expect(leave).toBeVisible();
  await leave.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(leave).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Name or search for someone")).toHaveValue("Later unsaved name");
  // Cancel means stay: the page behind Quick Add must not have moved to the saved person.
  await expect(page).toHaveURL(/\/contacts$/);
  await dialog.getByRole("link", { name: "Open saved person" }).click();
  await leave.getByRole("button", { name: "Leave", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/contacts/${savedContactId}$`));
  await expect(dialog).toBeHidden();
});

for (const review of [false, true]) test(`Quick Add guards reload in the ${review ? "review" : "capture"} stage`, async ({ page }) => {
  const dialog = await capture(page, review);
  const warning = page.waitForEvent("dialog");
  const reload = page.evaluate(() => window.location.reload());
  const prompt = await warning; expect(prompt.type()).toBe("beforeunload"); await prompt.dismiss(); await reload;
  await expect(dialog).toBeVisible();
  await expect(review ? dialog.getByLabel("Name or search for someone") : dialog.getByLabel("What do you want to remember?")).not.toHaveValue("");
});

for (const stop of ["button", "timeout"]) test(`Quick Add recovers from ${stop} and retries the same capture safely`, async ({ page }) => {
  const dialog = await capture(page);
  if (stop === "timeout") await page.clock.install();
  const keys: string[] = []; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/quick-capture", async route => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().postDataJSON().requestId);
    if (keys.length === 1) { await gate; await route.abort().catch(() => undefined); }
    else await route.continue();
  });
  try {
    await dialog.getByRole("button", { name: "Save all 2", exact: true }).click();
    await expect(dialog.getByLabel("Name or search for someone")).toBeDisabled();
    await expect.poll(() => keys.length).toBe(1);
    if (stop === "timeout") await page.clock.fastForward(30_001);
    else await dialog.getByRole("button", { name: "Stop waiting", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("couldn’t confirm");
    await expect(dialog.getByLabel("Name or search for someone")).toBeEnabled();
  } finally { release(); }
  await dialog.getByRole("button", { name: "Save all 2", exact: true }).click();
  await expect(dialog.getByText("Saved together", { exact: true })).toBeVisible();
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
});
