import { createHash, randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block" }); test.setTimeout(120_000);
let userId: string, workspaceId: string; const token = randomUUID(), mixes: string[] = [], templates: string[] = [];
const errors: string[] = [];
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `mix-library-${randomUUID()}@example.invalid`, name: "Library fixture", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Library fixture", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.contact.create({ data: { workspaceId, displayName: "Directory comparison", firstName: "Directory", lastName: "comparison" } });
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  for (let index = 0; index < 24; index++) {
    const mix = await prisma.mix.create({ data: { workspaceId, name: index === 0 ? "A welcome conversation" : `Follow-up ${String(index).padStart(2, "0")}`, description: index === 0 ? "A short sequence to welcome someone and stay in touch." : "A reusable follow-up.", status: "DRAFT", triggerMode: "MANUAL_START" } }); mixes.push(mix.id);
    for (let beat = 0; beat < 2; beat++) { const template = await prisma.stepTemplate.create({ data: { workspaceId, name: beat ? "Check in again" : "Say hello", channel: "PHONE_CALL", versions: { create: { version: 1, script: beat ? "How has everything been going since we spoke?" : "Hello! What would be most useful to talk about today?" } } }, include: { versions: true } }); await prisma.mixStep.create({ data: { mixId: mix.id, stepVersionId: template.versions[0].id, dayOffset: beat * 7, sortOrder: beat } }); }
  }
  for (const name of ["A friendly starting rhythm", "Keep the conversation going", "A quiet return"]) templates.push((await prisma.sharedMix.create({ data: { title: name, description: "A ready-made plan you can adapt to your own words.", category: "Relationships", framework: "Ready-made", durationDays: 7, steps: [{ name: "Say hello", channel: "PHONE_CALL", script: "What would be helpful to talk about?", dayOffset: 0, sendTimeMinutes: 600 }], status: "APPROVED" } })).id);
});
test.beforeEach(async ({ page, context }) => {
  errors.length = 0; page.on("pageerror", error => errors.push(error.message));
  await prisma.mixFavorite.deleteMany({ where: { workspaceId } });
  await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
  await page.setViewportSize({ width: 1440, height: 1100 }); await page.goto("/mixes", { waitUntil: "networkidle" });
});
test.afterEach(() => expect(errors).toEqual([]));
test.afterAll(async () => { await prisma.sharedMix.deleteMany({ where: { id: { in: templates } } }); if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } }); if (userId) await prisma.user.deleteMany({ where: { id: userId } }); });

test("Mixes use three panes with Beat preview, search and complete pagination", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1100 });
  const library = page.getByRole("complementary", { name: "Mix library", exact: true }), selected = page.getByRole("region", { name: "Selected Mix", exact: true }), context = page.getByRole("complementary", { name: "People and Journey connections", exact: true });
  await expect(selected.getByRole("heading", { name: "A welcome conversation", exact: true })).toBeVisible(); await expect(selected.getByText("Hello! What would be most useful to talk about today?", { exact: true })).toBeVisible();
  const left = await library.boundingBox(), center = await selected.boundingBox(), right = await context.boundingBox(); expect(left!.x + left!.width).toBeLessThanOrEqual(center!.x + 2); expect(center!.x + center!.width).toBeLessThanOrEqual(right!.x + 2);
  await library.getByRole("searchbox", { name: "Search Mixes", exact: true }).fill("Follow-up 23"); await library.getByRole("button", { name: "Search Mixes", exact: true }).click();
  await expect(selected.getByRole("heading", { name: "Follow-up 23", exact: true })).toBeVisible(); await expect(library.locator(".mix-library-row")).toHaveCount(1);
  await library.getByRole("link", { name: "Clear filters", exact: true }).click(); await library.getByRole("link", { name: "Next Mixes", exact: true }).click(); await expect(library.locator(".mix-library-row")).toHaveCount(4);
  await page.goto(`/mixes?mix=${mixes[23]}`); await expect(selected.getByRole("heading", { name: "Follow-up 23", exact: true })).toBeVisible();
});

test("favorites persist across reloads and filter the complete Mix library", async ({ page }) => {
  await page.getByRole("button", { name: "Add A welcome conversation to favorites", exact: true }).click(); await expect(page.getByRole("button", { name: "Remove A welcome conversation from favorites", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.reload({ waitUntil: "networkidle" }); await page.getByRole("link", { name: "Favorites", exact: true }).click(); await expect(page.locator(".mix-library-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Remove A welcome conversation from favorites", exact: true }).click(); await expect(page.locator(".mix-library-row")).toHaveCount(0);
  expect(await prisma.mixFavorite.count({ where: { workspaceId, userId } })).toBe(0);
});

test("preview and editing stay in the workspace and protect an unsaved Beat", async ({ page }) => {
  const selected = page.getByRole("region", { name: "Selected Mix", exact: true }); await selected.getByRole("link", { name: "Edit", exact: true }).click();
  const script = selected.locator('textarea[name="inlineScript-0"]').first(); await expect(script).toBeVisible(); await script.fill("A revised conversation for this person.");
  page.once("dialog", dialog => dialog.dismiss()); await selected.getByRole("link", { name: "Preview", exact: true }).click(); await expect(script).toHaveValue("A revised conversation for this person.");
  await page.getByRole("button", { name: "Add A welcome conversation to favorites", exact: true }).click(); await expect(page.getByRole("button", { name: "Remove A welcome conversation from favorites", exact: true })).toBeVisible(); await expect(script).toHaveValue("A revised conversation for this person.");
  await selected.getByRole("button", { name: "Save Mix", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "Mix saved" })).toBeVisible();
  await page.getByRole("region", { name: "Selected Mix", exact: true }).getByRole("link", { name: "Preview", exact: true }).click(); await expect(page.getByText("A revised conversation for this person.", { exact: true })).toBeVisible();
});

test("both ready-made entry points use one library with preview and personal favorites", async ({ page }) => {
  await page.goto("/mixes/new", { waitUntil: "networkidle" }); await expect(page).toHaveURL(/\/templates$/); await expect(page.getByRole("heading", { name: "Mixes", exact: true })).toBeVisible(); await expect(page.getByText("Find a starting rhythm", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Add A friendly starting rhythm to favorites", exact: true }).click(); await page.getByRole("link", { name: "Favorites", exact: true }).click(); await expect(page.locator(".mix-library-row")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Selected ready-made Mix", exact: true })).toContainText("Say hello");
  await page.reload({ waitUntil: "networkidle" }); await expect(page.getByRole("button", { name: "Remove A friendly starting rhythm from favorites", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "Create your own", exact: true }).click(); await expect(page).toHaveURL(/\/mixes\/new\?custom=1$/); await expect(page.getByLabel("Mix name", { exact: true })).toBeVisible();
});

test("Mix library reflows across phone, tablet and desktop in both themes", async ({ page }) => {
  test.setTimeout(240_000);
  for (const width of [320, 390, 767, 768, 834, 900, 901, 1099, 1100, 1194, 1199, 1200, 1279, 1280, 1440, 1699, 1700, 1920, 2560, 3440, 3840]) for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 1100 }); await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width < 1200) await page.getByRole("navigation", { name: "Mix workspace panels" }).getByRole("button", { name: "Beats", exact: true }).click();
    await expect(page.getByRole("region", { name: "Beat preview", exact: true })).toBeVisible();
    if ([320, 834, 1440, 1920, 3840].includes(width)) { const scan = await axeInPage(page).include(".mix-workspace-page").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze(); expect(scan.violations).toEqual([]); }
    if (process.env.CONNECTION_ARTIFACTS && [320, 390, 834, 1440, 1920, 3840].includes(width)) await page.screenshot({ path: `${process.env.CONNECTION_ARTIFACTS}/mix-library-${width}-${theme}.png`, fullPage: true });
    if (width < 1200) {
      const panels = page.getByRole("navigation", { name: "Mix workspace panels" }); await panels.getByRole("button", { name: "Details", exact: true }).click(); await expect(page.getByRole("complementary", { name: "People and Journey connections" })).toBeVisible();
      await panels.getByRole("button", { name: "Mixes", exact: true }).click(); if (process.env.CONNECTION_ARTIFACTS && [390, 834].includes(width)) await page.screenshot({ path: `${process.env.CONNECTION_ARTIFACTS}/mix-directory-${width}-${theme}.png`, fullPage: true }); const row = page.locator(".mix-library-item").first(); await row.click(); await expect(page.getByRole("region", { name: "Beat preview", exact: true })).toBeVisible();
    }
  }
});


test("Mix panes share Contacts directory and detail boundaries", async ({ page }) => {
  for (const width of [1200, 1440, 1700, 1920, 3840]) {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto("/contacts", { waitUntil: "networkidle" });
    const contactDirectory = await page.locator(".contacts-directory").boundingBox();
    const contactDetails = await page.locator(".contact-profile-details").boundingBox();
    if (process.env.CONNECTION_ARTIFACTS && width === 1920) await page.screenshot({ path: `${process.env.CONNECTION_ARTIFACTS}/contacts-comparison.png`, fullPage: true });
    await page.goto("/mixes", { waitUntil: "networkidle" });
    const mixDirectory = await page.getByRole("complementary", { name: "Mix library", exact: true }).boundingBox();
    expect(mixDirectory!.x).toBeCloseTo(contactDirectory!.x, 0);
    expect(mixDirectory!.width).toBeCloseTo(contactDirectory!.width, 0);
    expect(mixDirectory!.y).toBeCloseTo(contactDirectory!.y, 0);
    const details = await page.getByRole("complementary", { name: "People and Journey connections", exact: true }).boundingBox();
    if (width >= 1700) expect(details!.x).toBeCloseTo(contactDetails!.x, 0);
    const editor = await page.getByRole("region", { name: "Selected Mix", exact: true }).boundingBox();
    expect(editor!.width).toBeGreaterThan(380);
    expect(await page.locator(".mix-library-shell").evaluate(node => getComputedStyle(node).borderRadius)).toBe("0px");
  }
});

test("directory filters and tools stay reachable by keyboard and after an empty result", async ({ page }) => {
  const filter = page.getByRole("button", { name: "Filter Mixes", exact: true });
  await filter.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "Status", exact: true }).selectOption("ACTIVE");
  await dialog.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No matching Mixes", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Filter Mixes", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Clear filters", exact: true }).first().click();
  await expect(page.locator(".mix-library-row")).toHaveCount(20);
  await page.getByRole("button", { name: "More Mix tools", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "My invitations", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "More Mix tools", exact: true })).toBeFocused();
});
