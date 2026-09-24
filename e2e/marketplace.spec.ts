import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { test, expect, type BrowserContext } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { installMegaMix } from "../src/lib/mega-mix-service";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block", actionTimeout: 15_000 });
test.setTimeout(240_000);
const dir = ".artifacts/market-20260924/e2e";
const users: string[] = [], workspaces: string[] = [];
const errors: string[] = [];

async function signIn(context: BrowserContext, userId: string) {
  const token = randomUUID();
  const session = await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  await context.clearCookies();
  await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
  return session;
}
async function owner(context: BrowserContext, label: string) {
  const userId = (await prisma.user.create({ data: { name: label, email: `market-${randomUUID()}@example.invalid`, emailVerifiedAt: new Date() } })).id;
  const workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: `${label} Co`, slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  users.push(userId); workspaces.push(workspaceId);
  await signIn(context, userId);
  return { userId, workspaceId };
}
test.beforeEach(async ({ page }) => { errors.length = 0; page.on("pageerror", error => errors.push(error.message)); await mkdir(dir, { recursive: true }); });
test.afterEach(async () => {
  await prisma.workspace.deleteMany({ where: { id: { in: workspaces } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  users.length = 0; workspaces.length = 0;
  expect(errors).toEqual([]);
});

test("share a Mega-Mix, favorite and add it, see live edits and updates, report it and restore it", async ({ page, context }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const author = await owner(context, "Rivera");
  const installed = await installMegaMix({ workspaceId: author.workspaceId, actorUserId: author.userId, blueprintId: "contractor", expectedVersion: 1 });
  const step = await prisma.mixStep.findFirstOrThrow({ where: { mix: { megaMixMembership: { pipelineId: installed.id } } }, orderBy: { sortOrder: "asc" }, include: { stepVersion: true } });
  await prisma.stepVersion.update({ where: { id: step.stepVersionId }, data: { body: "Hi Maria, call me on 555 123 4567 when you can." } });

  // The privacy check names what to fix before sharing.
  await page.goto(`/mixes/mega?megaMix=${installed.id}`);
  await page.getByRole("button", { name: "Share Contractor on the Marketplace" }).click();
  const sheet = page.getByRole("dialog", { name: "Share this Mega-Mix" });
  await expect(sheet.getByRole("heading", { name: "Check 2 details before sharing" })).toBeVisible();
  await expect(sheet).toContainText("Possible name: Maria");
  await expect(sheet).toContainText("Phone number: 555 123 4567");
  await expect(sheet.getByRole("textbox", { name: "Shared as" })).toHaveValue("Rivera Co");
  await page.screenshot({ path: `${dir}/share-check-1920.png` });
  expect((await axeInPage(page).include("dialog[open]").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await sheet.getByRole("textbox", { name: "Shared as" }).fill("Rivera Renovations");
  await sheet.getByRole("textbox", { name: "What is it for? (optional)" }).fill("From first call to the next project");
  await sheet.getByRole("checkbox", { name: /no private customer details/ }).check();
  await sheet.getByRole("button", { name: "Share Mega-Mix", exact: true }).click();
  await expect(page.getByText(/Shared\. People see your latest saved version/)).toBeVisible();
  const listing = await prisma.marketplaceListing.findFirstOrThrow({ where: { pipelineId: installed.id } });
  expect(listing).toMatchObject({ status: "LIVE", summary: "From first call to the next project" });

  // Another owner finds it in Community, favorites it and adds a copy.
  const reader = await owner(context, "Reader");
  await page.goto("/marketplace?section=community");
  const list = page.getByRole("navigation", { name: "Community Mixes and Mega-Mixes" });
  await expect(list).toContainText("by Rivera Renovations");
  await list.getByRole("button", { name: /Add Contractor to favorites \(0 favorites\)/ }).click();
  await expect(list.getByRole("button", { name: /Remove Contractor from favorites \(1 favorite\)/ })).toBeVisible();
  await page.getByRole("link", { name: /Contractor\s*Mega-Mix · 13 Mixes/ }).click();
  await expect(page.getByText("Shared by Rivera Renovations")).toBeVisible();
  await expect(page.getByRole("region", { name: "Selected Mega-Mix" }).getByRole("button", { name: /Remove Contractor from favorites \(1 favorite\)/ })).toBeVisible();
  await expect(page.getByRole("list", { name: "Contractor Beats in journey order" })).toContainText("Understand the project");
  await page.screenshot({ path: `${dir}/listing-1920.png` });
  const add = page.getByRole("complementary", { name: "Add or share" });
  await add.getByRole("textbox", { name: "Mega-Mix name" }).fill("Rivera pipeline");
  await add.getByRole("checkbox", { name: /I’ve reviewed the wording/ }).check();
  await add.getByRole("button", { name: "Add to my account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Rivera pipeline", exact: true })).toBeVisible();
  expect(await prisma.mix.count({ where: { workspaceId: reader.workspaceId } })).toBe(13);

  // The author edits; the listing shows it live and the reader is offered the update.
  await prisma.stepVersion.update({ where: { id: step.stepVersionId }, data: { body: "Hi {{First Name}}, thanks for reaching out. {{SMS Signature}}" } });
  await page.goto(`/mixes/mega?megaMix=${(await prisma.megaMixPipeline.findFirstOrThrow({ where: { workspaceId: reader.workspaceId } })).id}`);
  await expect(page.getByText("The shared original of this has been updated. Your copy stays as it is.")).toBeVisible();
  expect(await prisma.stepVersion.count({ where: { stepTemplate: { workspaceId: reader.workspaceId }, body: { contains: "Maria" } } })).toBe(1);

  // Reporting private information hides it at once.
  await page.getByRole("link", { name: "Review the update" }).click();
  await page.getByRole("button", { name: "Report", exact: true }).click();
  const report = page.getByRole("dialog", { name: "Report this share" });
  await report.getByRole("radio", { name: /Shares someone’s private information/ }).check();
  await expect(report.getByText("This hides the share right away while our team reviews it.")).toBeVisible();
  await report.getByRole("textbox", { name: "Details (optional)" }).fill("A customer's first name is in Beat 1");
  await report.getByRole("button", { name: "Send report", exact: true }).click();
  await expect(page.getByText("Thanks. The share is hidden while our team reviews it.")).toBeVisible();
  expect(await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ status: "HIDDEN", hiddenReason: "PRIVATE_INFO" });
  await expect(page.getByRole("navigation", { name: "Community Mixes and Mega-Mixes" })).toHaveCount(0);

  // The author is told, sees the reason and the details, never who reported.
  await signIn(context, author.userId);
  await page.goto("/mixes");
  await expect(page.getByRole("alert").filter({ hasText: "Your shared “Contractor” was reported: Shares someone’s private information. It’s hidden while our team reviews it." })).toBeVisible();
  await page.getByRole("alert").getByRole("link", { name: "Review" }).click();
  const reports = page.getByRole("complementary", { name: "Add or share" });
  await expect(reports).toContainText("A customer's first name is in Beat 1");
  await expect(reports).not.toContainText("Reader");
  await reports.getByRole("button", { name: "Mark as read" }).click();
  await expect(page.getByRole("navigation", { name: "Marketplace section" }).getByLabel(/new report/)).toHaveCount(0);

  // Staff restore it with a note the author can read.
  const staffUser = await prisma.user.create({ data: { name: "Moderator", email: `moderator-${randomUUID()}@example.invalid`, emailVerifiedAt: new Date(), staffMembership: { create: { role: "EDITOR", grants: ["mixes.publish"] } } } });
  users.push(staffUser.id);
  const session = await signIn(context, staffUser.id);
  await prisma.adminMfaCredential.create({ data: { userId: staffUser.id, enabledAt: new Date(), secretCiphertext: "browser-fixture" } });
  await prisma.adminMfaSession.create({ data: { userId: staffUser.id, sessionId: session.id, expiresAt: session.expiresAt } });
  await page.goto("/admin/marketplace");
  const row = page.getByRole("article").filter({ hasText: "Contractor" });
  await expect(row).toContainText("Shares someone’s private information · hid the share");
  await page.screenshot({ path: `${dir}/admin-review-1920.png` });
  await row.getByRole("textbox", { name: "Note for the author" }).fill("The author removed the name. Restored.");
  await row.getByRole("button", { name: "Restore share", exact: true }).click();
  await expect(page.getByText("Decision saved.")).toBeVisible();
  expect(await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ status: "LIVE", hiddenReason: null });
});

test("Marketplace sections, filters and both themes work on phone, tablet and desktop", async ({ page, context }) => {
  const author = await owner(context, "Layout author");
  const installed = await installMegaMix({ workspaceId: author.workspaceId, actorUserId: author.userId, blueprintId: "photographer", expectedVersion: 1 });
  await prisma.marketplaceAuthor.create({ data: { workspaceId: author.workspaceId, publicName: "Lens & Light" } });
  await prisma.marketplaceListing.create({ data: { kind: "MEGA_MIX", workspaceId: author.workspaceId, pipelineId: installed.id, title: "Photographer", beatCount: 18, mixCount: 11, channels: ["CALL", "EMAIL", "TEXT"], fingerprint: "seed", industry: "Professional services" } });
  await owner(context, "Layout reader");
  await page.goto("/marketplace?section=community");
  // Filters narrow by channel and length and can be cleared.
  await page.getByRole("button", { name: "Filter and sort the Marketplace" }).click();
  await page.getByRole("combobox", { name: "Length" }).selectOption("long");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("status").filter({ hasText: "1 result" })).toBeVisible();
  await page.getByRole("button", { name: "Filter and sort the Marketplace" }).click();
  await page.getByRole("combobox", { name: "Length" }).selectOption("short");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("status").filter({ hasText: "0 results" })).toBeVisible();
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/marketplace\?section=community$/);
  await expect(page.getByRole("status").filter({ hasText: "1 result" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search the Marketplace" }).fill("lens");
  await page.getByRole("searchbox", { name: "Search the Marketplace" }).press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "1 result" })).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => { localStorage.setItem("jitm-appearance", theme); document.documentElement.dataset.theme = theme; }, theme);
    for (const width of [320, 390, 834, 1440, 1920]) {
      await page.setViewportSize({ width, height: width > 1000 ? 1000 : 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
      await page.screenshot({ path: `${dir}/marketplace-${width}-${theme}.png` });
      expect((await axeInPage(page).include(".mix-workspace-page").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
      if (width < 1200) {
        await page.getByRole("navigation", { name: "Mix workspace panels" }).getByRole("button", { name: "Beats" }).click();
        await expect(page.getByRole("list", { name: "Photographer Beats in journey order" })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
        await page.screenshot({ path: `${dir}/marketplace-detail-${width}-${theme}.png` });
        await page.getByRole("navigation", { name: "Mix workspace panels" }).getByRole("button", { name: "Mixes" }).click();
      }
    }
  }
});
