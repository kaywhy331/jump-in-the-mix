import { createHash, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off" });
test.setTimeout(120_000);
let workspaceId: string, userId: string;
const token = randomUUID();
test.beforeAll(async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { email: `sheet-${suffix}@example.com`, name: "Sheet fixture owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } }); userId = user.id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: user.id, slug: `sheet-${suffix}`, name: "Sheet fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Sheet follow-up", channel: "SMS" } });
  const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: "A prepared estimate follow-up." } });
  const plan = await prisma.mix.create({ data: { workspaceId, name: "Sheet plan", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: { stepVersionId: version.id, dayOffset: 0, sortOrder: 1 } } }, include: { steps: true } });
  for (let index = 1; index <= 3; index++) {
    const contact = await prisma.contact.create({ data: { workspaceId, displayName: `Sheet person ${index}`, phones: { create: { phone: `+1555010100${index}`, normalized: `+1555010100${index}`, isPrimary: true } } } });
    await prisma.jump.create({ data: { workspaceId, contactId: contact.id, mixId: plan.id, mixStepId: plan.steps[0].id, stepVersionId: version.id, scheduledAt: new Date(Date.now() - (4 - index) * 60_000), reason: "Estimate follow-up", uniquenessKey: randomUUID(), templateSnapshot: {}, renderedSnapshot: { body: version.body } } });
  }
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});
async function ready(page: Page) { await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", ""); }
async function setTheme(page: Page, colorScheme: "light" | "dark") {
  await page.emulateMedia({ colorScheme });
  // Inspect the settled palette: WebKit can start axe while the button
  // background is still transitioning from the previous system theme.
  await page.evaluate(async () => {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await Promise.all(document.getAnimations().filter(animation => "transitionProperty" in animation).map(animation => animation.finished.catch(() => undefined)));
  });
}
async function closeSheet(page: Page) {
  await page.keyboard.press("Escape");
  // Native close queues trigger restoration. Let it finish before directing
  // the next keyboard action to another sheet or the profile control.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
async function audit(page: Page) { expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]); }

test("message drafts, snooze fields, nested confirmation and focus survive closing and reopening", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/jumps"); await ready(page);
  const review = page.getByRole("button", { name: "Review message for Sheet person 2", exact: true });
  await review.focus(); await page.keyboard.press("Enter");
  const message = page.getByRole("dialog", { name: "Message Sheet person 2", exact: true });
  await expect(message).toBeVisible();
  const draft = message.getByRole("textbox", { name: "Fine-tune before sending", exact: true });
  await draft.fill("Keep this unsent estimate draft.");
  for (const colorScheme of ["light", "dark"] as const) { await setTheme(page, colorScheme); await audit(page); }
  await closeSheet(page); await expect(review).toBeFocused();
  await page.keyboard.press("Enter"); await expect(draft).toHaveValue("Keep this unsent estimate draft.");
  await closeSheet(page);

  const more = page.getByRole("button", { name: "More options for Sheet person 2", exact: true });
  await more.focus(); await page.keyboard.press("Enter");
  const options = page.getByRole("dialog", { name: "Follow up with Sheet person 2", exact: true });
  const date = options.getByRole("group", { name: "Choose a day", exact: true });
  const chosen = new Date(Date.now() + 7 * 86_400_000);
  const chosenLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(chosen);
  await date.locator(".when-trigger.date").click();
  if (chosen.getMonth() !== new Date().getMonth()) await date.getByRole("button", { name: "Next month", exact: true }).click();
  await date.getByRole("button", { name: chosenLabel, exact: true }).click();
  await expect(date.locator(".when-trigger.date")).toContainText(new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(chosen));
  const stop = options.getByRole("button", { name: "Stop mix…", exact: true }); await stop.click();
  const confirmation = page.getByRole("dialog", { name: "Stop Sheet plan for Sheet person 2?", exact: true });
  await expect(confirmation).toBeVisible(); await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(stop).toBeFocused(); await expect(options).toBeVisible();
  await closeSheet(page); await expect(more).toBeFocused();
  await page.keyboard.press("Enter"); await expect(date.locator('input[name="customDate"]')).toHaveValue(chosen.toISOString().slice(0, 10)); await closeSheet(page);

  await page.setViewportSize({ width: 1440, height: 1000 });
  const profile = page.getByRole("button", { name: "Profile", exact: true }); await profile.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Profile and settings", exact: true })).toBeVisible(); await audit(page);
  await closeSheet(page); await expect(profile).toBeFocused();
  expect(await prisma.jump.count({ where: { workspaceId, status: "PENDING" } })).toBe(3);
});

test("the contact message shortcut opens automatically and keeps an unscheduled draft", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/contacts?intent=one-time-jump"); await ready(page);
  await page.getByRole("checkbox", { name: "Select Sheet person 1", exact: true }).check();
  const dialog = page.getByRole("dialog", { name: "Message 1 person", exact: true }); await expect(dialog).toBeVisible();
  const message = dialog.getByRole("textbox", { name: "Message", exact: true }); await message.fill("An unscheduled personal message.");
  await audit(page); await closeSheet(page);
  const trigger = page.getByRole("button", { name: "Message", exact: true }); await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter"); await expect(message).toHaveValue("An unscheduled personal message.");
  await closeSheet(page);
  for (const width of [320, 390, 768, 900, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const actions = page.getByRole("complementary", { name: "Actions for selected contacts" });
    for (const name of ["Clear", "Select all", "Tags", "Message", "Export CSV", "Archive 1…"]) {
      const action = actions.getByRole("button", { name, exact: true });
      await expect(action).toBeVisible();
      expect(await action.evaluate(element => {
        const r = element.getBoundingClientRect();
        return r.width >= 44 && r.height >= 44 && [[r.left + 4, r.top + 4], [r.right - 4, r.bottom - 4]].every(([x, y]) => element.contains(document.elementFromPoint(x, y)));
      }), `${name} must have a reachable 44-pixel target at ${width}px`).toBe(true);
    }
    for (const colorScheme of ["light", "dark"] as const) { await setTheme(page, colorScheme); await audit(page); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  }
  expect(await prisma.jump.count({ where: { workspaceId } })).toBe(3);
});
