import { createHash, randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block" });
test.setTimeout(180_000);
const token = randomUUID(), framework = `Pane acceptance ${randomUUID()}`, templates: string[] = [];
const libraryUrl = `/templates?framework=${encodeURIComponent(framework)}`;
let userId: string, workspaceId: string, ownMixId: string;
const errors: string[] = [];
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `ready-panes-${randomUUID()}@example.invalid`, name: "Ready-made fixture", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Ready-made fixture", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  for (let i = 0; i < 26; i++) templates.push((await prisma.sharedMix.create({ data: {
    title: `Ready sample ${String(i).padStart(2, "0")}`, description: "A conversation you can adapt to your own words.", category: "Relationships", industry: "Any business", framework, durationDays: 7, status: i === 25 ? "UNPUBLISHED" : "APPROVED", updatedAt: new Date(Date.now() - i * 1000),
    steps: i === 24 ? { invalid: true } : [{ name: `Say hello ${i}`, channel: "PHONE_CALL", script: `Opening conversation ${i}.`, dayOffset: 0, sendTimeMinutes: 600 }, { name: `Follow through ${i}`, channel: "PHONE_CALL", script: `Follow-up conversation ${i}.`, dayOffset: 7, sendTimeMinutes: 660 }]
  } })).id);
  ownMixId = (await prisma.mix.create({ data: { workspaceId, name: "My adapted conversation", description: "Existing copy", status: "DRAFT", triggerMode: "MANUAL_START", source: `SHARED_MIX:${templates[0]}` } })).id;
});
test.beforeEach(async ({ page, context }) => {
  errors.length = 0; page.on("pageerror", error => errors.push(error.message));
  await prisma.mixFavorite.deleteMany({ where: { workspaceId } });
  await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(libraryUrl, { waitUntil: "networkidle" });
});
test.afterEach(() => expect(errors).toEqual([]));
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  await prisma.sharedMix.deleteMany({ where: { id: { in: templates } } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});

test("ready-made selection, favorites and existing copies stay connected without importing", async ({ page }) => {
  const selected = page.getByRole("region", { name: "Selected ready-made Mix", exact: true });
  const details = page.getByRole("complementary", { name: "Ready-made Mix details", exact: true });
  const before = await prisma.mix.count({ where: { workspaceId } });
  await expect(selected.getByRole("heading", { name: "Ready sample 00", exact: true })).toBeVisible();
  await expect(selected).toContainText("Opening conversation 0.");
  await expect(details.getByRole("link", { name: "My adapted conversation draft" })).toHaveAttribute("href", `/mixes?mix=${ownMixId}`);
  await page.locator(".mix-library-item").filter({ hasText: "Ready sample 01" }).click();
  await expect(selected).toContainText("Opening conversation 1.");
  await expect(details.getByRole("link", { name: "Use this mix", exact: true })).toHaveAttribute("href", `/templates/${templates[1]}/use`);
  await expect(details).not.toContainText("My adapted conversation");
  await page.getByRole("button", { name: "Add Ready sample 01 to favorites", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove Ready sample 01 from favorites", exact: true })).toHaveAttribute("aria-pressed", "true");
  // Visible links keep prefetching after load, so the network never idles; wait for the app instead.
  await page.reload();
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
  await expect(selected).toContainText("Opening conversation 1.");
  await expect(page.getByRole("button", { name: "Remove Ready sample 01 from favorites", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "Favorites", exact: true }).click();
  await expect(page.locator(".mix-library-row")).toHaveCount(1);
  await expect(selected).toContainText("Opening conversation 1.");
  await page.getByRole("button", { name: "Remove Ready sample 01 from favorites", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No favorite mixes yet" })).toBeVisible();
  expect(await prisma.mix.count({ where: { workspaceId } })).toBe(before);
  expect(await prisma.sharedMix.aggregate({ where: { id: { in: templates } }, _sum: { importCount: true } })).toMatchObject({ _sum: { importCount: 0 } });
});

test("pagination, filtered selection, unpublished and invalid content have clear outcomes", async ({ page }) => {
  await expect(page.locator(".mix-library-row")).toHaveCount(20);
  await page.getByRole("link", { name: "Next ready-made mixes", exact: true }).click();
  await expect(page.locator(".mix-library-row")).toHaveCount(5);
  await page.locator(".mix-library-item").filter({ hasText: "Ready sample 23" }).click();
  await expect(page.getByRole("region", { name: "Selected ready-made Mix" })).toContainText("Opening conversation 23.");
  await expect(page).toHaveURL(/page=2/);
  await page.goto(`${libraryUrl}&mix=${templates[23]}`);
  await expect(page.getByRole("region", { name: "Selected ready-made Mix" })).toContainText("Opening conversation 23.");
  await page.getByRole("searchbox", { name: "Search ready-made mixes", exact: true }).fill("Ready sample 03");
  await page.getByRole("button", { name: "Search ready-made mixes", exact: true }).click();
  await expect(page.locator(".mix-library-row")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Selected ready-made Mix" })).toContainText("Opening conversation 3.");
  await page.goto(`${libraryUrl}&mix=${templates[24]}`);
  await expect(page.getByText("This mix is being updated. Please choose another.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Use this mix", exact: true })).toHaveCount(0);
  await page.goto(`/templates?mix=${templates[25]}`);
  await expect(page.getByRole("heading", { name: "Let’s get you back on track.", exact: true })).toBeVisible();
  await expect(page.getByText("Ready sample 25", { exact: true })).toHaveCount(0);
});

test("setup returns to the selected preview and creates an editable draft", async ({ page }) => {
  await page.getByRole("complementary", { name: "Ready-made Mix details" }).getByRole("link", { name: "Use this mix", exact: true }).click();
  await expect(page.getByLabel("Mix name", { exact: true })).toHaveValue("Ready sample 00");
  await expect(page.getByRole("link", { name: "Mix library", exact: true })).toHaveAttribute("href", `/templates?mix=${templates[0]}`);
  await page.getByRole("link", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`mix=${templates[0]}`));
  await expect(page.getByRole("region", { name: "Selected ready-made Mix" })).toContainText("Opening conversation 0.");
  await page.getByRole("complementary", { name: "Ready-made Mix details" }).getByRole("link", { name: "Use this mix", exact: true }).click();
  await page.getByLabel("Mix name", { exact: true }).fill("My personal ready-made copy");
  await expect(page.getByLabel("After setup")).toHaveValue("DRAFT");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/mixes\?mix=.*view=edit/, { timeout: 60_000 });
  const copy = await prisma.mix.findFirstOrThrow({ where: { workspaceId, name: "My personal ready-made copy" }, include: { steps: true } });
  expect(copy.status).toBe("DRAFT"); expect(copy.source).toBe(`SHARED_MIX:${templates[0]}`); expect(copy.steps).toHaveLength(2);
  await page.goto(`/templates?mix=${templates[0]}`);
  await expect(page.getByRole("complementary", { name: "Ready-made Mix details" }).getByRole("link", { name: "My personal ready-made copy draft" })).toHaveAttribute("href", `/mixes?mix=${copy.id}`);
});

test("ready-made panes match My mixes and reflow in both themes with large text", async ({ page }) => {
  test.setTimeout(300_000);
  for (const width of [390, 834, 1200, 1440, 1700, 1920]) {
    await page.setViewportSize({ width, height: 1080 });
    if (width >= 1200) {
      await page.goto("/mixes", { waitUntil: "networkidle" });
      const ownDirectory = await page.locator(".mix-library-directory").boundingBox();
      const ownCenter = await page.locator(".mix-editor-workspace").boundingBox();
      const ownDetails = await page.locator(".mix-context-pane").boundingBox();
      await page.goto(libraryUrl, { waitUntil: "networkidle" });
      const directory = await page.locator(".mix-library-directory").boundingBox();
      const center = await page.locator(".mix-editor-workspace").boundingBox();
      const details = await page.locator(".mix-context-pane").boundingBox();
      expect(directory!.width).toBeCloseTo(ownDirectory!.width, 0); expect(directory!.x).toBeCloseTo(ownDirectory!.x, 0); expect(directory!.y).toBeCloseTo(ownDirectory!.y, 0);
      expect(center!.x).toBeCloseTo(ownCenter!.x, 0); expect(center!.width).toBeCloseTo(ownCenter!.width, 0);
      expect(details!.x).toBeCloseTo(ownDetails!.x, 0);
    } else await page.goto(libraryUrl, { waitUntil: "networkidle" });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const panels = page.getByRole("navigation", { name: "Mix workspace panels" });
      if (width < 1200) {
        await panels.getByRole("button", { name: "Mixes", exact: true }).click();
        if (process.env.CONNECTION_ARTIFACTS) await page.screenshot({ path: `${process.env.CONNECTION_ARTIFACTS}/ready-directory-${width}-${theme}.png`, fullPage: true });
        await page.locator(".mix-library-item").first().click();
      }
      await expect(page.getByRole("region", { name: "Beat preview", exact: true })).toBeVisible();
      if (process.env.CONNECTION_ARTIFACTS) await page.screenshot({ path: `${process.env.CONNECTION_ARTIFACTS}/ready-beats-${width}-${theme}.png`, fullPage: true });
      expect((await axeInPage(page).include(".mix-workspace-page").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
      if (width < 1200) {
        await panels.getByRole("button", { name: "Details", exact: true }).click();
        await expect(page.getByRole("complementary", { name: "Ready-made Mix details" }).getByRole("link", { name: "Use this mix", exact: true })).toBeVisible();
        if (process.env.CONNECTION_ARTIFACTS) await page.screenshot({ path: `${process.env.CONNECTION_ARTIFACTS}/ready-details-${width}-${theme}.png`, fullPage: true });
        expect((await axeInPage(page).include(".mix-workspace-page").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
      }
    }
  }
  for (const width of [390, 1920]) {
    await page.setViewportSize({ width, height: 1080 });
    await page.goto(`${libraryUrl}&mix=${templates[0]}`, { waitUntil: "networkidle" });
    await page.evaluate(() => { const sizes = Array.from(document.querySelectorAll<HTMLElement>(".mix-workspace-page *"), node => ({ node, size: parseFloat(getComputedStyle(node).fontSize) })); for (const { node, size } of sizes) node.style.fontSize = `${size * 2}px`; });
    if (process.env.CONNECTION_ARTIFACTS) await page.screenshot({ path: `${process.env.CONNECTION_ARTIFACTS}/ready-text-200-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("keyboard filters, tools and search remain available after an empty result", async ({ page }) => {
  const filter = page.getByRole("button", { name: "Filter ready-made mixes", exact: true });
  await filter.focus(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Filter ready-made mixes", exact: true });
  await expect(dialog.getByLabel("Filter by approach")).toHaveValue(framework);
  await page.keyboard.press("Escape"); await expect(filter).toBeFocused();
  await page.getByRole("searchbox", { name: "Search ready-made mixes", exact: true }).fill("No matching synthetic name");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "No mixes match", exact: true })).toBeVisible();
  await filter.click(); await expect(dialog).toBeVisible(); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "More ready-made Mix tools", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "My invitations", exact: true })).toBeVisible();
  await page.keyboard.press("Escape"); await expect(page.getByRole("button", { name: "More ready-made Mix tools", exact: true })).toBeFocused();
  await page.getByRole("link", { name: "Clear filters", exact: true }).click();
  await expect(page).toHaveURL(/\/templates$/);
  // The ready-made library is the Marketplace collection since 91e5aad replaced the "Ready-made" tab.
  await expect(page.getByRole("navigation", { name: "Mix collection", exact: true }).getByRole("link", { name: "Marketplace", exact: true })).toHaveAttribute("aria-current", "page");
});
