import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { MARKETING_SCENARIO_VERSION } from "../src/lib/marketing-scenarios";
import { axeInPage } from "./axe-in-page";

// Onboarding recommends one person and one follow-up; once that follow-up is ready, Today offers a complete Mega-Mix
// as the optional next step, suggested from the business type or the marketing example (JITM-09 §2.20, B-17).
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.setTimeout(120_000);
const users: string[] = [];
const errors: string[] = [];

async function account(page: Page, options: { scenario?: string; megaMix?: boolean } = {}) {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { name: "First Start Owner", email: `first-start-${suffix}@example.test`, emailVerifiedAt: new Date() } }); users.push(user.id);
  const workspace = await prisma.workspace.create({ data: { name: "First start fixture", slug: suffix, ownerId: user.id, members: { create: { userId: user.id } }, profile: { create: { onboardingDone: false } } } });
  await prisma.userPreference.create({ data: { userId: user.id, timezone: "UTC" } });
  if (options.scenario) await prisma.workspaceMarketingPreference.create({ data: { workspaceId: workspace.id, scenario: options.scenario, version: MARKETING_SCENARIO_VERSION } });
  if (options.megaMix) await prisma.megaMixPipeline.create({ data: { workspaceId: workspace.id, name: "Existing Mega-Mix" } });
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  await page.context().clearCookies();
  await page.context().addCookies([{ name: "jitm_session", value: token, url: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000", httpOnly: true, sameSite: "Strict" }]);
  await page.request.get("/api/auth/browser-context");
}

async function prepareFirstFollowUp(page: Page, choices: { businessType?: string; personalOnly?: boolean; email?: boolean } = {}) {
  await page.goto("/onboarding");
  await expect(page.getByRole("radio", { name: /^One person and one follow-up · Recommended/ })).toBeChecked();
  if (choices.personalOnly) {
    await page.getByRole("checkbox", { name: /Personal connections/ }).check();
    await page.getByRole("checkbox", { name: /^Business/ }).uncheck();
  }
  if (choices.businessType) await page.getByLabel("Type of business").selectOption(choices.businessType);
  await page.getByLabel("Name", { exact: true }).fill("Riley Example");
  await page.getByLabel("Phone recommended").fill("+1 (555) 010-0142");
  if (choices.email) await page.getByLabel("Email recommended").fill("riley@example.test");
  await page.getByRole("checkbox", { name: /I reviewed this Mix/ }).check();
  await Promise.all([page.waitForURL(/\/jumps\?.*welcome=1/), page.getByRole("button", { name: "Prepare my first follow-up" }).click()]);
  await expect(page.getByText("Your first follow-up for Riley Example is ready.")).toBeVisible();
}

test.beforeAll(async () => {
  await prisma.dateType.upsert({ where: { scopeKey_slug: { scopeKey: "system", slug: "follow-up" } }, create: { scopeKey: "system", slug: "follow-up", name: "Follow-up", isSystem: true }, update: {} });
});
test.beforeEach(({ page }) => { errors.length = 0; page.on("pageerror", error => errors.push(error.message)); });
test.afterEach(async () => {
  await prisma.contactActivity.deleteMany({ where: { actorUserId: { in: users } } });
  await prisma.workspace.deleteMany({ where: { ownerId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } }); users.length = 0;
  expect(errors).toEqual([]);
});

test("a real estate start offers the Real estate Mega-Mix as the optional next step", async ({ page }) => {
  await account(page);
  await prepareFirstFollowUp(page, { businessType: "Real estate" });
  const next = page.getByRole("link", { name: "Set up the Real estate Mega-Mix", exact: true });
  await expect(next).toHaveAttribute("href", "/templates/journeys?journey=real-estate");
  const accessibility = await axeInPage(page).include(".notice").analyze();
  expect(accessibility.violations).toEqual([]);
  await next.click();
  await expect(page.getByRole("heading", { name: "Real estate Mega-Mix" })).toBeVisible();
});

test("a realtor's first follow-up comes from the Real estate journey, starting with a new buyer lead", async ({ page }) => {
  await account(page);
  await page.goto("/onboarding");
  await page.getByLabel("Type of business").selectOption("Real estate");
  const reason = page.getByLabel("What do you want to do?");
  await expect(reason).toHaveValue("Reply to a new buyer lead");
  await expect(reason.locator("option")).toHaveText(["Reply to a new buyer lead", "Reply to a new seller lead", "Follow up after a showing or open house", "Check back when they asked you to",
    "Update a client who is under contract", "Check in after closing", "Keep in touch with a past client"]);
  const preview = page.getByRole("region", { name: "Review your starter" });
  await expect(preview.getByRole("heading", { name: "New buyer lead", exact: true })).toBeVisible();
  await expect(preview).toContainText("thanks for reaching out about buying a home");
  await expect(preview).toContainText("1 day after");
  await expect(preview).not.toContainText(/estimate/i);
  await reason.selectOption("Follow up after a showing or open house");
  await expect(preview.getByRole("heading", { name: "After a showing or open house", exact: true })).toBeVisible();
  await reason.selectOption("Reply to a new buyer lead");
  await page.getByLabel("Name", { exact: true }).fill("Riley Example");
  await page.getByLabel("Phone recommended").fill("+1 (555) 010-0142");
  await page.getByRole("checkbox", { name: /I reviewed this Mix/ }).check();
  await Promise.all([page.waitForURL(/\/jumps\?.*welcome=1/), page.getByRole("button", { name: "Prepare my first follow-up" }).click()]);
  await expect(page.getByText("Your first follow-up for Riley Example is ready.")).toBeVisible();
  const workspace = await prisma.workspace.findFirstOrThrow({ where: { ownerId: users.at(-1)! } });
  const first = await prisma.jump.findFirstOrThrow({ where: { workspaceId: workspace.id }, orderBy: { scheduledAt: "asc" } });
  expect(JSON.stringify(first.renderedSnapshot)).toContain("thanks for reaching out about buying a home");
  expect(JSON.stringify(first.renderedSnapshot)).not.toMatch(/estimate|my business/i);
});

test("the marketing example names its Mega-Mix even when several share the business type", async ({ page }) => {
  await account(page, { scenario: "photography" });
  await prepareFirstFollowUp(page, { email: true });
  await expect(page.getByRole("link", { name: "Set up the Photographer Mega-Mix", exact: true })).toHaveAttribute("href", "/templates/journeys?journey=photographer");
});

test("a business type that several Mega-Mixes share opens the list to choose from", async ({ page }) => {
  await account(page);
  await prepareFirstFollowUp(page, { businessType: "Professional services" });
  await expect(page.getByRole("link", { name: "Choose a complete Mega-Mix", exact: true })).toHaveAttribute("href", "/templates/journeys");
});

test("no Mega-Mix is suggested for personal use or when the account already has one", async ({ page }) => {
  await account(page);
  await prepareFirstFollowUp(page, { personalOnly: true });
  await expect(page.getByRole("link", { name: /Mega-Mix/ })).toHaveCount(0);
  await account(page, { megaMix: true });
  await prepareFirstFollowUp(page, { businessType: "Real estate" });
  await expect(page.getByRole("link", { name: /Mega-Mix/ })).toHaveCount(0);
});

test("the recommended form keeps its controls whole and fits 320px at 200% text", async ({ page }) => {
  await account(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/onboarding");
  await expect(page.getByRole("checkbox", { name: /I reviewed this Mix/ })).toBeEnabled();
  const whole = await page.locator(".first-win-onboarding .checkbox-card > input:visible").evaluateAll(inputs => inputs.map(input => { const box = input.getBoundingClientRect(); return box.width >= box.height; }));
  expect(whole.length).toBeGreaterThan(3);
  expect(whole).not.toContain(false);
  await page.addStyleTag({ content: "html { font-size: 200% !important }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
});

test.describe("on a device whose timezone differs from the account's", () => {
  test.use({ timezoneId: "America/Chicago" });

  test("an untouched form reports no unsaved changes and leaves without asking", async ({ page }) => {
    await account(page);
    await page.goto("/onboarding");
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Prepare my first follow-up" }) });
    // The page fills in the device timezone, today's date there and the starter preview; none of that is the person's change.
    await expect(form.getByText("Detected from this device for follow-up times.", { exact: false })).toBeVisible();
    await expect(form.getByRole("checkbox", { name: /I reviewed this Mix/ })).toBeEnabled();
    const unsaved = form.getByRole("status").filter({ hasText: "Unsaved changes" });
    await expect(unsaved).toHaveCount(0);
    const prompts: string[] = [];
    page.on("dialog", dialog => { prompts.push(dialog.message()); void dialog.dismiss(); });
    expect(await page.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(false);
    // What the person types is still protected, and undoing it clears the warning.
    const name = page.getByLabel("Name", { exact: true });
    await name.fill("Riley Example");
    await expect(unsaved).toHaveCount(1);
    await name.fill("");
    await expect(unsaved).toHaveCount(0);
    await Promise.all([page.waitForURL(url => url.pathname === "/"), page.getByRole("link", { name: "Jump in the Mix home" }).click()]);
    expect(prompts).toEqual([]);
  });
});
