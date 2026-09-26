import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { test, expect, type BrowserContext } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { installMegaMix } from "../src/lib/mega-mix-service";
import { refreshSharesOf } from "../src/lib/marketplace-service";
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
  await page.screenshot({ path: `${dir}/share-check-1920.png`, scale: "css" });
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
  await page.screenshot({ path: `${dir}/listing-1920.png`, scale: "css" });
  const add = page.getByRole("complementary", { name: "Add or share" });
  await add.getByRole("textbox", { name: "Mega-Mix name" }).fill("Rivera pipeline");
  await add.getByRole("checkbox", { name: /I’ve reviewed the wording/ }).check();
  await add.getByRole("button", { name: "Add to my account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Rivera pipeline", exact: true })).toBeVisible();
  expect(await prisma.mix.count({ where: { workspaceId: reader.workspaceId } })).toBe(13);

  // The author edits; the listing shows it live and the reader is offered the update. The edit goes straight to the
  // database, so the test runs what the author's save now does after it commits: refresh the shares of that Mix.
  await prisma.stepVersion.update({ where: { id: step.stepVersionId }, data: { body: "Hi {{First Name}}, thanks for reaching out. {{SMS Signature}}" } });
  await refreshSharesOf({ workspaceId: author.workspaceId, mixIds: [step.mixId] });
  await page.goto(`/mixes/mega?megaMix=${(await prisma.megaMixPipeline.findFirstOrThrow({ where: { workspaceId: reader.workspaceId } })).id}`);
  await expect(page.getByText("The shared original of this has been updated. Your copy stays as it is.")).toBeVisible();
  expect(await prisma.stepVersion.count({ where: { stepTemplate: { workspaceId: reader.workspaceId }, body: { contains: "Maria" } } })).toBe(1);

  // A spam report keeps the share live for others; it leaves only the reporter's Community list and waits for staff.
  await page.getByRole("link", { name: "Review the update" }).click();
  await page.getByRole("button", { name: "Report", exact: true }).click();
  const spam = page.getByRole("dialog", { name: "Report this share" });
  await spam.getByRole("radio", { name: /Spam, scam or harmful links/ }).check();
  await expect(spam.getByText("The share stays visible to others while our team reviews it, and leaves your Community list.")).toBeVisible();
  await spam.getByRole("textbox", { name: "Details (optional)" }).fill("Beat 3 links to a coupon site");
  await spam.getByRole("button", { name: "Send report", exact: true }).click();
  await expect(page.getByText("Thanks. Our team will review this share.")).toBeVisible();
  expect(await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ status: "LIVE", hiddenReason: null });
  expect(await prisma.marketplaceReport.findFirstOrThrow({ where: { listingId: listing.id, reporterUserId: reader.userId } })).toMatchObject({ reason: "SPAM", status: "OPEN", autoHidden: false });
  await expect(page.getByRole("navigation", { name: "Community Mixes and Mega-Mixes" })).toHaveCount(0);

  // A verified account reporting private information hides it at once.
  await owner(context, "Second");
  await page.goto("/marketplace?section=community");
  await expect(page.getByRole("navigation", { name: "Community Mixes and Mega-Mixes" })).toContainText("by Rivera Renovations");
  await page.getByRole("link", { name: /Contractor\s*Mega-Mix · 13 Mixes/ }).click();
  await page.getByRole("button", { name: "Report", exact: true }).click();
  const report = page.getByRole("dialog", { name: "Report this share" });
  await report.getByRole("radio", { name: /Shares someone’s private information/ }).check();
  await expect(report.getByText("This usually hides the share right away while our team reviews it.")).toBeVisible();
  await report.getByRole("textbox", { name: "Details (optional)" }).fill("A customer's first name is in Beat 1");
  await report.getByRole("button", { name: "Send report", exact: true }).click();
  await expect(page.getByText("Thanks. The share is hidden while our team reviews it.")).toBeVisible();
  expect(await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ status: "HIDDEN", hiddenReason: "PRIVATE_INFO" });
  await expect(page.getByRole("navigation", { name: "Community Mixes and Mega-Mixes" })).toHaveCount(0);

  // The author is told the reasons, never who reported or, while the reports are open, what they wrote.
  await signIn(context, author.userId);
  await page.goto("/mixes");
  await expect(page.getByRole("alert").filter({ hasText: "Your shared “Contractor” was reported: Shares someone’s private information. It’s hidden while our team reviews it." })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Your shared “Contractor” was reported: Spam, scam or harmful links. It stays shared while our team reviews it." })).toBeVisible();
  await page.getByRole("alert").filter({ hasText: "private information" }).getByRole("link", { name: "Review" }).click();
  const reports = page.getByRole("complementary", { name: "Add or share" });
  await expect(reports).toContainText("Shares someone’s private information");
  await expect(reports).toContainText("Spam, scam or harmful links");
  await expect(reports).not.toContainText("A customer's first name is in Beat 1");
  await expect(reports).not.toContainText("coupon site");
  await expect(reports).not.toContainText("Reader");
  await expect(reports).not.toContainText("Second");
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
  await expect(row).toContainText("Spam, scam or harmful links");
  await expect(row).toContainText("Beat 3 links to a coupon site");
  await expect(row).toContainText("Hidden now. Restoring puts it back on the Marketplace");
  await page.screenshot({ path: `${dir}/admin-review-1920.png`, scale: "css" });
  await row.getByRole("textbox", { name: "Note for the author" }).fill("The author removed the name. Restored.");
  await row.getByRole("button", { name: "Restore share", exact: true }).click();
  await expect(page.getByText("Decision saved.")).toBeVisible();
  expect(await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ status: "LIVE", hiddenReason: null });
  expect(await prisma.marketplaceReport.count({ where: { listingId: listing.id, status: "DISMISSED" } })).toBe(2);
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
      await page.screenshot({ path: `${dir}/marketplace-${width}-${theme}.png`, scale: "css" });
      expect((await axeInPage(page).include(".mix-workspace-page").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
      if (width < 1200) {
        await page.getByRole("navigation", { name: "Mix workspace panels" }).getByRole("button", { name: "Beats" }).click();
        await expect(page.getByRole("list", { name: "Photographer Beats in journey order" })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
        await page.screenshot({ path: `${dir}/marketplace-detail-${width}-${theme}.png`, scale: "css" });
        await page.getByRole("navigation", { name: "Mix workspace panels" }).getByRole("button", { name: "Mixes" }).click();
      }
    }
  }
});

test("an author's own share offers no heart or add, and stays manageable once its Mix is archived", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const author = await owner(context, "Porch");
  const mix = await prisma.mix.create({ data: { workspaceId: author.workspaceId, name: "Porch follow-up", triggerMode: "MANUAL_START", status: "ACTIVE",
    steps: { create: { dayOffset: 0, sortOrder: 1, stepVersion: { create: { version: 1, body: "Hi {{First Name}}, how is the new porch? {{SMS Signature}}", stepTemplate: { create: { workspaceId: author.workspaceId, name: "Porch check-in", channel: "SMS", isActive: false } } } } } } } });
  await prisma.marketplaceAuthor.create({ data: { workspaceId: author.workspaceId, publicName: "Porch People" } });
  const listing = await prisma.marketplaceListing.create({ data: { kind: "MIX", workspaceId: author.workspaceId, mixId: mix.id, title: "Porch follow-up", beatCount: 1, mixCount: 1, channels: ["TEXT"], fingerprint: "seed" } });
  const item = (section: string) => `/marketplace?section=${section}&item=${encodeURIComponent(`listing:${listing.id}`)}`;

  // Community shows the author's own share without a heart, and its pane offers the author's controls, not an add.
  await page.goto("/marketplace?section=community");
  const list = page.getByRole("navigation", { name: "Community Mixes and Mega-Mixes" });
  await expect(list).toContainText("by Porch People");
  await expect(list.getByRole("button", { name: /Porch follow-up to favorites/ })).toHaveCount(0);
  await page.goto(item("community"));
  const pane = page.getByRole("complementary", { name: "Add or share" });
  await expect(pane.getByRole("heading", { name: "Your share" })).toBeVisible();
  await expect(pane.getByRole("heading", { name: "Add to your account" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Selected Mix" }).getByRole("button", { name: /to favorites/ })).toHaveCount(0);
  await expect(pane.getByRole("link", { name: "Open to edit or manage sharing" })).toBeVisible();
  // The favorites API refuses the author too, in plain words.
  const refused = await page.evaluate(async listingId => {
    const response = await fetch("/api/marketplace/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId, favorite: true }) });
    return { status: response.status, body: await response.json() };
  }, listing.id);
  expect(refused).toEqual({ status: 400, body: { error: "This is your own share, so it can’t be one of your favorites." } });

  // Once the Mix is archived, My shares keeps the share with its status and a way to stop it; there is no page to open.
  await prisma.mix.update({ where: { id: mix.id }, data: { status: "ARCHIVED" } });
  await page.goto("/marketplace?section=mine");
  await expect(page.getByRole("navigation", { name: "Your shares" })).toContainText("shared · nothing to show right now");
  await page.goto(item("mine"));
  await expect(page.getByText("This Mix is archived, so it is left out of the Community list. Your share, its favorites and its reports are kept.")).toBeVisible();
  const own = page.getByRole("complementary", { name: "Add or share" });
  await expect(own).toContainText("Shared, but left out of Community for now.");
  await expect(own).toContainText("An archived Mix can’t be opened or edited.");
  await expect(own.getByRole("link", { name: "Open to edit or manage sharing" })).toHaveCount(0);
  await page.screenshot({ path: `${dir}/own-share-archived-1440.png`, scale: "css" });
  expect((await axeInPage(page).include(".mix-workspace-page").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);

  // Nobody else sees it, in the list or by its link.
  await owner(context, "Porch reader");
  await page.goto("/marketplace?section=community");
  await expect(page.getByRole("link", { name: /Porch follow-up/ })).toHaveCount(0);
  await page.goto(item("community"));
  await expect(page.getByRole("heading", { name: "Nothing to show" })).toBeVisible();

  // The author stops sharing it from its pane.
  await signIn(context, author.userId);
  await page.goto(item("mine"));
  await page.getByRole("complementary", { name: "Add or share" }).getByRole("button", { name: "Stop sharing", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Stop sharing Porch follow-up?" });
  await confirm.getByRole("button", { name: "Stop sharing", exact: true }).click();
  await expect(page.getByText("Sharing stopped. Copies people already added stay theirs.")).toBeVisible();
  expect(await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ status: "UNSHARED" });
});

test("archiving a shared Mix says it stops the share, then stops it", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const author = await owner(context, "Gutter");
  const mix = await prisma.mix.create({ data: { workspaceId: author.workspaceId, name: "Gutter check", triggerMode: "MANUAL_START", status: "ACTIVE",
    steps: { create: { dayOffset: 0, sortOrder: 1, stepVersion: { create: { version: 1, body: "Hi {{First Name}}, are the new gutters holding up? {{SMS Signature}}", stepTemplate: { create: { workspaceId: author.workspaceId, name: "Gutter check-in", channel: "SMS", isActive: false } } } } } } } });
  await prisma.marketplaceAuthor.create({ data: { workspaceId: author.workspaceId, publicName: "Gutter Crew" } });
  const listing = await prisma.marketplaceListing.create({ data: { kind: "MIX", workspaceId: author.workspaceId, mixId: mix.id, title: "Gutter check", beatCount: 1, mixCount: 1, channels: ["TEXT"], fingerprint: "seed" } });

  await page.goto(`/mixes?mix=${mix.id}`);
  await page.locator("details.mix-manage > summary").click();
  await page.getByRole("button", { name: "Archive Mix", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Archive Gutter check?" });
  await expect(confirm).toContainText("It also stops being shared on the Marketplace; copies people already added stay theirs.");
  expect((await axeInPage(page).include("dialog[open]").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await confirm.getByRole("button", { name: "Archive Mix", exact: true }).click();
  await expect(page.getByText("Mix archived. It’s no longer shared on the Marketplace; copies people already added stay theirs.")).toBeVisible();
  expect(await prisma.mix.findUniqueOrThrow({ where: { id: mix.id } })).toMatchObject({ status: "ARCHIVED" });
  expect(await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ status: "UNSHARED" });
  expect(await prisma.auditLog.count({ where: { workspaceId: author.workspaceId, action: "marketplace.unshare", entityId: listing.id } })).toBe(1);

  await owner(context, "Gutter reader");
  await page.goto("/marketplace?section=community");
  await expect(page.getByRole("link", { name: /Gutter check/ })).toHaveCount(0);
});

test("after staff keep a reported share hidden, its author changes it and asks for another review", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const author = await owner(context, "Deck");
  const mix = await prisma.mix.create({ data: { workspaceId: author.workspaceId, name: "Deck care", triggerMode: "MANUAL_START", status: "ACTIVE",
    steps: { create: { dayOffset: 0, sortOrder: 1, stepVersion: { create: { version: 1, body: "Hi Dana, time to reseal the deck? {{SMS Signature}}", stepTemplate: { create: { workspaceId: author.workspaceId, name: "Deck reminder", channel: "SMS", isActive: false } } } } } } }, include: { steps: true } });
  await prisma.marketplaceAuthor.create({ data: { workspaceId: author.workspaceId, publicName: "Deck Pros" } });
  const listing = await prisma.marketplaceListing.create({ data: { kind: "MIX", workspaceId: author.workspaceId, mixId: mix.id, title: "Deck care", beatCount: 1, mixCount: 1, channels: ["TEXT"], fingerprint: "seed", status: "HIDDEN", hiddenReason: "PRIVATE_INFO" } });
  const reader = await owner(context, "Deck reader");
  await prisma.marketplaceReport.create({ data: { listingId: listing.id, reporterUserId: reader.userId, reporterWorkspaceId: reader.workspaceId, reason: "PRIVATE_INFO", details: "A customer's name is in Beat 1", autoHidden: true } });
  const staffUser = await prisma.user.create({ data: { name: "Moderator", email: `moderator-${randomUUID()}@example.invalid`, emailVerifiedAt: new Date(), staffMembership: { create: { role: "EDITOR", grants: ["mixes.publish"] } } } });
  users.push(staffUser.id);
  await prisma.adminMfaCredential.create({ data: { userId: staffUser.id, enabledAt: new Date(), secretCiphertext: "browser-fixture" } });
  const asStaff = async () => { const session = await signIn(context, staffUser.id); await prisma.adminMfaSession.create({ data: { userId: staffUser.id, sessionId: session.id, expiresAt: session.expiresAt } }); };
  const own = `/marketplace?section=mine&item=${encodeURIComponent(`listing:${listing.id}`)}`;

  // Staff keep it hidden with a note.
  await asStaff();
  await page.goto("/admin/marketplace");
  let row = page.getByRole("article").filter({ hasText: "Deck care" });
  await expect(row).toContainText("keeping it hidden upholds the reports");
  await row.getByRole("textbox", { name: "Note for the author" }).fill("The customer’s name is still in Beat 1.");
  await row.getByRole("button", { name: "Keep hidden", exact: true }).click();
  await expect(page.getByText("Decision saved. The author can see it on their share.")).toBeVisible();
  const kept = await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } });
  expect(kept).toMatchObject({ status: "HIDDEN", reviewRequestedAt: null });
  expect(kept.reviewedFingerprint).toBe(kept.fingerprint);
  expect(await prisma.marketplaceReport.count({ where: { listingId: listing.id, status: "UPHELD" } })).toBe(1);

  // The author must change the wording before asking again.
  await signIn(context, author.userId);
  await page.goto(own);
  await expect(page.getByText("Hidden after our team’s review: Shares someone’s private information. Change the wording, then ask for another review; it stays in your account.")).toBeVisible();
  const pane = page.getByRole("complementary", { name: "Add or share" });
  await expect(pane).toContainText("Our team: The customer’s name is still in Beat 1.");
  await expect(pane).toContainText("Change the wording first. Another review looks at what you changed since our team’s decision.");
  await expect(pane.getByRole("button", { name: "Ask for another review" })).toHaveCount(0);
  await prisma.stepVersion.update({ where: { id: mix.steps[0].stepVersionId }, data: { body: "Hi {{First Name}}, time to reseal the deck? {{SMS Signature}}" } });
  await page.reload();
  await expect(pane).toContainText("Changed the wording? Ask our team to look again. It stays hidden until they decide.");
  await pane.getByRole("textbox", { name: "Note for our team (optional)" }).fill("I replaced the name with {{First Name}}.");
  await page.screenshot({ path: `${dir}/review-request-1440.png`, scale: "css" });
  expect((await axeInPage(page).include(".mix-workspace-page").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await pane.getByRole("button", { name: "Ask for another review", exact: true }).click();
  await expect(page.getByText("Sent. Our team will look at your changes and let you know. The share stays hidden until then.")).toBeVisible();
  await expect(pane).toContainText("Your note: I replaced the name with {{First Name}}.");
  await expect(pane.getByRole("button", { name: "Ask for another review" })).toHaveCount(0);
  expect((await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).reviewRequestedAt).not.toBeNull();

  // Staff see the request and the note, and restore it with a reply.
  await asStaff();
  await page.goto("/admin/marketplace");
  row = page.getByRole("article").filter({ hasText: "Deck care" });
  await expect(row).toContainText("Another review requested");
  await expect(row).toContainText("Author’s note: I replaced the name with {{First Name}}.");
  await expect(row).toContainText("The author changed this share and asked for another review.");
  await row.getByRole("textbox", { name: "Note for the author" }).fill("Thanks for fixing it. It’s back on the Marketplace.");
  await row.getByRole("button", { name: "Restore share", exact: true }).click();
  await expect(page.getByText("Decision saved. The author can see it on their share.")).toBeVisible();
  expect(await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ status: "LIVE", hiddenReason: null, reviewRequestedAt: null, reviewResponseNote: "Thanks for fixing it. It’s back on the Marketplace." });

  // The author is told, reads the reply and marks it read.
  await signIn(context, author.userId);
  await page.goto("/mixes");
  await expect(page.getByText("Our team replied about your shared “Deck care”. It’s shared on the Marketplace.")).toBeVisible();
  await page.getByRole("link", { name: "Read the reply" }).click();
  await expect(pane).toContainText("Our team replied");
  await expect(pane).toContainText("Thanks for fixing it. It’s back on the Marketplace.");
  await pane.getByRole("button", { name: "Mark reply as read", exact: true }).click();
  await expect(pane.getByRole("button", { name: "Mark reply as read" })).toHaveCount(0);
  expect((await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } })).reviewResponseSeenAt).not.toBeNull();
});
