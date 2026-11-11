import { createHash, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";
import { applyRenderedTheme } from "./theme-fixture";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off" });
let userId: string, workspaceId: string, contactId: string;
const token = randomUUID();
test.beforeAll(async () => {
  const suffix = randomUUID();
  userId = (await prisma.user.create({ data: { email: `calendar-agenda-${suffix}@example.test`, name: "Calendar agenda fixture", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: suffix, name: "Calendar agenda fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  contactId = (await prisma.contact.create({ data: { workspaceId, displayName: "Calendar agenda fixture person", relationshipState: { create: { workspaceId, priority: "NORMAL" } } } })).id;
  await prisma.calendarEntry.create({ data: { workspaceId, contactId, title: "Existing fixture event", kind: "MEETING", startsAt: new Date("2027-10-15T10:00:00Z"), endsAt: new Date("2027-10-15T10:30:00Z"), timezone: "UTC" } });
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});
async function ready(page: Page) { await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", ""); await expect(page.getByRole("heading", { level: 1, name: "Calendar", exact: true })).toBeVisible(); }

async function navigationFits(page: Page) {
  const boxes = await page.getByRole("navigation", { name: "Calendar weeks" }).getByRole("link").evaluateAll(links => links.map(link => {
    const box = link.getBoundingClientRect();
    return { top: box.top, left: box.left, right: box.right, width: box.width, height: box.height };
  }));
  expect(boxes).toHaveLength(3);
  for (const [index, box] of boxes.entries()) {
    expect(box.top).toBeCloseTo(boxes[0].top, 0);
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.right).toBeLessThanOrEqual(page.viewportSize()!.width);
    if (index) expect(box.left - boxes[index - 1].right).toBeGreaterThanOrEqual(8);
  }
}

async function labelsAbove(page: Page) {
  const form = page.locator(".calendar-entry-form");
  for (const selector of [".calendar-title", ".calendar-kind", ".calendar-with", ".calendar-form-row:has(.when-picker)", ".when-duration", "label:has(input[name=location])", ".when-duration-custom"]) {
    const row = form.locator(selector);
    const label = row.locator(":scope > span, :scope > label").first();
    const control = row.locator(":scope > input, :scope > select, :scope > div").first();
    await expect(label).toBeVisible();
    const a = await label.boundingBox(), b = await control.boundingBox();
    expect(a!.y + a!.height).toBeLessThanOrEqual(b!.y);
  }
  const zone = form.locator(".timezone-current > span");
  const a = await zone.locator("small").boundingBox(), b = await zone.locator("strong").boundingBox();
  expect(a!.y + a!.height).toBeLessThanOrEqual(b!.y);
}

test("agenda is the default with events, New event has history, and Cancel and filters return to the agenda", async ({ page }) => {
  for (const width of [1440, 1024, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/calendar?date=2027-10-15"); await ready(page);
    const editor = page.locator(".calendar-editor-panel");
    await expect(editor).not.toBeVisible();
    await expect(page.getByRole("link", { name: "Existing fixture event", exact: true })).toBeVisible();
    await navigationFits(page);
    const newEvent = page.getByRole("link", { name: "New event", exact: true });
    await newEvent.focus(); await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/new=1/);
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel("Title", { exact: true })).toHaveValue("");
    await expect(editor.locator(".calendar-title > label")).toHaveText("Title");
    await page.goBack();
    await expect(editor).not.toBeVisible();
    await newEvent.click();
    await editor.getByRole("link", { name: "Cancel", exact: true }).click();
    await expect(editor).not.toBeVisible();
    expect(new URL(page.url()).searchParams.has("new")).toBe(false);
    await page.locator(".calendar-filter-options > summary").click();
    await page.getByLabel("Find an event").fill("No matching event");
    await page.getByRole("button", { name: "Show dates" }).click();
    await expect(page).toHaveURL(/eventq=No/);
    await expect(editor).not.toBeVisible();
    await expect(page.getByText("No events or follow-ups in these dates.", { exact: false })).toBeVisible();
  }
});

test("an empty agenda stays deliberate, and the requested form keeps entries through an availability failure", async ({ page }) => {
  await page.goto("/calendar?date=2027-10-17&edit=missing-event"); await ready(page);
  await expect(page.locator(".calendar-editor-panel")).not.toBeVisible();
  await expect(page.getByText("No events or follow-ups in these dates.", { exact: false })).toBeVisible();
  await expect(page).toHaveTitle("Calendar | Jump in the Mix");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Calendar");
  await page.route("**/api/calendar/availability?**", route => route.abort());
  await page.getByRole("link", { name: "New event", exact: true }).click();
  const form = page.locator(".calendar-entry-form");
  await form.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(form.getByLabel("Title", { exact: true })).toBeFocused();
  await form.getByLabel("Title", { exact: true }).fill("Kept event draft");
  await page.keyboard.press("Tab");
  await expect(form.getByLabel("Event type")).toBeFocused();
  await form.locator(".when-trigger.time").click();
  await expect(page.getByRole("dialog", { name: "Starts", exact: true })).toContainText(/could not|couldn’t|Failed to fetch/i);
  await page.keyboard.press("Escape");
  await expect(form.getByLabel("Title", { exact: true })).toHaveValue("Kept event draft");
  await page.unroute("**/api/calendar/availability?**");
  await form.getByLabel("Event type").selectOption("BLOCK");
  await expect(form.getByLabel("Title", { exact: true })).toHaveValue("Kept event draft");
  page.on("dialog", dialog => dialog.accept());
  await form.getByRole("link", { name: "Cancel", exact: true }).click();
  await expect(form).toHaveCount(0);
  await page.getByRole("link", { name: "New event", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("");
  await page.context().clearCookies();
  await page.goto("/calendar");
  await expect(page).toHaveURL(/\/login/);
});

for (const theme of ["light", "dark"] as const) {
  test(`Calendar agenda and form fit the size matrix in ${theme}`, async ({ page }, info) => {
    test.setTimeout(180_000);
    const sizes = [320, 375, 390, 767, 768, 834, 900, 901, 1024, 1099, 1100, 1194, 1199, 1200, 1279, 1280, 1440, 1599, 1600, 1699, 1700, 1920, 2560, 3440].map(width => ({ width, height: 900 }));
    sizes.push({ width: 844, height: 390 }, { width: 1440, height: 600 });
    await page.goto("/calendar?date=2027-10-15"); await ready(page);
    await applyRenderedTheme(page, theme);
    for (const size of sizes) {
      await applyRenderedTheme(page, theme, size);
      await expect(page.locator(".calendar-editor-panel")).not.toBeVisible();
      await navigationFits(page);
      // Separate browser calls can sample opposite sides of a breakpoint reflow.
      const [workspace, agenda] = await page.locator(".calendar-workspace").evaluate(element =>
        [element, element.querySelector(".calendar-directory")!].map(node => {
          const { width, left, right } = node.getBoundingClientRect();
          return { width, left, right };
        })
      );
      const viewport = `${size.width}x${size.height} ${theme}`;
      expect(agenda.width, viewport).toBeCloseTo(workspace.width, 0);
      expect(agenda.left, viewport).toBeCloseTo(workspace.left, 0);
      expect(agenda.right, viewport).toBeCloseTo(workspace.right, 0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), viewport).toBe(true);
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: `.artifacts/uxa09/${info.project.name}-${theme}-${size.width}x${size.height}-agenda.png` });
    }
    await page.getByRole("link", { name: "New event", exact: true }).click();
    await page.getByRole("button", { name: "Custom end", exact: true }).click();
    for (const size of sizes) {
      await applyRenderedTheme(page, theme, size);
      await labelsAbove(page);
      await navigationFits(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator(".calendar-editor-panel > h2").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `.artifacts/uxa09/${info.project.name}-${theme}-${size.width}x${size.height}-form.png` });
    }
    for (const width of [320, 375, 1024, 1440]) {
      await applyRenderedTheme(page, theme, { width, height: 900 });
      const zoom = await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await labelsAbove(page); await navigationFits(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `.artifacts/uxa09/${info.project.name}-${theme}-${width}-text200.png` });
      await zoom.evaluate(node => node.parentNode?.removeChild(node));
    }
    // 1209px at 110% zoom gives a fractional CSS width just below the 1100px boundary.
    await applyRenderedTheme(page, theme, { width: 1209, height: 900 });
    const zoom = await page.addStyleTag({ content: "html { zoom: 1.1; }" });
    await labelsAbove(page); await navigationFits(page);
    await page.screenshot({ path: `.artifacts/uxa09/${info.project.name}-${theme}-zoom110.png` });
    await zoom.evaluate(node => node.parentNode?.removeChild(node));
    await applyRenderedTheme(page, theme, { width: 1440, height: 900 });
    expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  });
}
