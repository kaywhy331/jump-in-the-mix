import { createHash, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block", actionTimeout: 15_000 });
test.setTimeout(120_000);

let workspaceId: string, userId: string, jumpId: string;
const token = randomUUID();
const body = "Hi Priya, the quote is ready. Draft fixture owner";

test.beforeAll(async () => {
  const suffix = randomUUID();
  userId = (await prisma.user.create({ data: { email: `phone-region-${suffix}@example.com`, name: "Draft fixture owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `phone-region-${suffix}`, name: "Phone region fixture", members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Quote text", channel: "SMS" } });
  const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body } });
  const mix = await prisma.mix.create({ data: { workspaceId, name: "Quote plan", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: [{ stepVersionId: version.id, dayOffset: 0, sortOrder: 1 }] } }, include: { steps: true } });
  // Saved before the region was chosen, so it holds the key the old code wrote (its digits).
  const contactId = (await prisma.contact.create({ data: { workspaceId, firstName: "Priya", displayName: "Priya Shah", phones: { create: { phone: "07911 123456", normalized: "07911123456", isPrimary: true } } } })).id;
  const scheduledAt = new Date(Date.now() - 60_000);
  jumpId = `${suffix}-region-jump`;
  await prisma.jump.create({ data: {
    id: jumpId, workspaceId, contactId, mixId: mix.id, mixStepId: mix.steps[0].id, stepVersionId: version.id, scheduledAt, baseScheduledAt: scheduledAt, status: "PENDING", reason: "Quote follow-up", uniquenessKey: jumpId,
    templateSnapshot: { subject: null, body, script: null, channel: "SMS", originalLocalDate: scheduledAt.toISOString().slice(0, 10), timezone: "UTC" },
    renderedSnapshot: { subject: null, body, script: null }
  } });
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) {
    await prisma.job.deleteMany({ where: { task: "canonicalize-phones", workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  }
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});

async function textLink(page: Page) {
  await page.goto("/jumps");
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 });
  await page.locator(`#jump-${jumpId}`).getByRole("button", { name: /^Review / }).click();
  return page.locator(`#jump-${jumpId} .editable-follow-up`).getByRole("link", { name: "Open text for Priya Shah", exact: true });
}

test("an owner reads saved numbers as another country's, and texts then go to the full number", async ({ page }) => {
  // North America (the default) cannot read a UK national number, so it is handed over as typed.
  await expect(await textLink(page)).toHaveAttribute("href", /^sms:07911123456\?&body=/);

  await page.goto("/account/preferences#phone-region");
  const card = page.locator("#phone-region");
  await expect(card.getByRole("combobox", { name: "Country for phone numbers" })).toHaveValue("US");
  await card.getByRole("combobox", { name: "Country for phone numbers" }).selectOption("GB");
  await card.getByRole("button", { name: "Review change", exact: true }).click();
  await expect(card).toContainText("Change to United Kingdom (+44)? 1 saved number is read again as United Kingdom numbers, so calls and automatic texts to it use the new reading. Numbers saved with + and a country code don’t change.");
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await axeInPage(page).include("#phone-region").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
  await card.getByRole("button", { name: "Use United Kingdom", exact: true }).click();
  await expect(page.getByText("Country for phone numbers saved. Saved numbers are updating in the background.")).toBeVisible();
  expect(await prisma.workspacePreference.findUniqueOrThrow({ where: { workspaceId } })).toMatchObject({ phoneRegion: "GB" });
  expect(await prisma.job.count({ where: { task: "canonicalize-phones", workspaceId, completedAt: null } })).toBeGreaterThanOrEqual(1);
  expect(await prisma.auditLog.count({ where: { workspaceId, actorUserId: userId, action: "workspace.phone-region.update" } })).toBe(1);

  // Before the background update reaches it, the saved number already dials in full.
  await expect(await textLink(page)).toHaveAttribute("href", /^sms:\+447911123456\?&body=/);
});
