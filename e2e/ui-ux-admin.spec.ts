import { randomUUID, randomBytes, createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { ADMIN_AREAS } from "../src/lib/admin-permissions";
import { adminAreaName } from "../src/lib/admin-navigation";
import { ADMIN_LOADING_TITLE } from "../src/app/(staff)/admin/loading-content";
import { applyRenderedTheme } from "./theme-fixture";
const database = new URL(process.env.DATABASE_URL ?? "postgresql://localhost/unknown");
test.skip(!["localhost", "127.0.0.1"].includes(database.hostname) || !database.pathname.startsWith("/jitm_design_"), "Disposable fixtures only");
test.setTimeout(120_000);

test("older email events remain searchable and paging preserves the investigation", async ({ page }) => {
  const prefix = `ux-event-${randomUUID()}`;
  const user = await prisma.user.create({ data: { name: "UX operator", email: `${prefix}@example.test`, emailVerifiedAt: new Date(), staffMembership: { create: { role: "OPERATOR" } } } });
  const token = randomBytes(32).toString("base64url");
  const session = await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  await prisma.adminMfaCredential.create({ data: { userId: user.id, enabledAt: new Date(), secretCiphertext: "synthetic-ux-fixture" } });
  await prisma.adminMfaSession.create({ data: { userId: user.id, sessionId: session.id, expiresAt: session.expiresAt } });
  try {
    await prisma.emailProviderEvent.createMany({ data: Array.from({ length: 65 }, (_, i) => ({ id: `${prefix}-${String(i).padStart(3, "0")}`, type: "email.delivered", recipientHashes: [], providerId: `${prefix}-provider`, occurredAt: new Date("2026-01-01T00:00:00Z"), receivedAt: new Date("2026-01-01T00:00:00Z") })) });
    await page.context().addCookies([{ name: "jitm_session", value: token, url: process.env.PLAYWRIGHT_BASE_URL!, httpOnly: true, sameSite: "Strict" }]);
    await page.goto(`/admin/email?q=${prefix}`);
    await expect(page.getByRole("navigation", { name: "Results pages" })).toContainText("1–30 of 65 results");
    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`q=${prefix}&page=2`));
    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Results pages" })).toContainText("61–65 of 65 results");
    await page.getByLabel("Event type or identifier").fill(`${prefix}-000`);
    await page.getByRole("button", { name: "Search events" }).click();
    await expect(page.getByRole("navigation", { name: "Results pages" })).toContainText("1–1 of 1 results");
    await expect(page.locator("main")).toContainText(`${prefix}-000`);
  } finally {
    await prisma.emailProviderEvent.deleteMany({ where: { id: { startsWith: prefix } } });
    await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});

/** The root title template's suffix (src/app/layout.tsx: "%s | Jump in the Mix"). */
const TITLE_SUFFIX = " | Jump in the Mix";
/** Staff pages that show one record; a missing ID opens the staff not-found. */
const RECORD_PAGES = ["/admin/access/{id}", "/admin/email/recovery/{id}", "/admin/email/suppressions/{id}", "/admin/reports/history/{id}", "/admin/support/{id}", "/admin/templates/{id}/edit", "/admin/users/{id}"];
/** The JITM-07 §5 staff boundaries (admin CSS: 430, 760, 980, 1100, 1300) on both sides, a phone floor and a wide desktop. */
const NAME_WIDTHS = [320, 430, 431, 760, 761, 980, 981, 1100, 1101, 1300, 1440] as const;

/** A synthetic staff member signed in to this browser; with MFA unless asked otherwise. */
async function staffMember(page: Page, prefix: string, { mfa = true } = {}) {
  const user = await prisma.user.create({ data: { name: "Title staff", email: `${prefix}@example.test`, emailVerifiedAt: new Date(), staffMembership: { create: { role: "OWNER" } } } });
  const token = randomBytes(32).toString("base64url");
  const session = await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  if (mfa) {
    await prisma.adminMfaCredential.create({ data: { userId: user.id, enabledAt: new Date(), secretCiphertext: "synthetic-title-fixture" } });
    await prisma.adminMfaSession.create({ data: { userId: user.id, sessionId: session.id, expiresAt: session.expiresAt } });
  }
  await page.context().clearCookies();
  await page.context().addCookies([{ name: "jitm_session", value: token, url: process.env.PLAYWRIGHT_BASE_URL!, httpOnly: true, sameSite: "Strict" }]);
  return user;
}

/** Opens a page and returns its one H1's text once the staff session check and the loading state are gone. */
async function openHeading(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByText("Checking your staff session…")).toHaveCount(0);
  await expect(page.getByText(ADMIN_LOADING_TITLE, { exact: true })).toBeHidden();
  const h1 = page.locator("h1");
  await expect(h1, `${path}: one H1`).toHaveCount(1);
  return (await h1.textContent() ?? "").replace(/\s+/g, " ").trim();
}

async function expectTitleMatchesHeading(page: Page, path: string) {
  const heading = await openHeading(page, path);
  expect(heading, `${path}: H1`).not.toBe("");
  await expect(page, `${path}: the tab reads the H1`).toHaveTitle(`${heading}${TITLE_SUFFIX}`);
  expect(await page.title(), `${path}: no staff prefix`).not.toMatch(/^Admin\b/);
  return heading;
}

test("every staff tab reads its H1, and navigation, H1 and title use one name (JITM-UXS-04)", async ({ page }) => {
  test.setTimeout(300_000);
  const prefix = `ux-title-${randomUUID()}`, users: string[] = [];
  const owner = await staffMember(page, prefix); users.push(owner.id);
  const customer = await prisma.user.create({ data: { name: "Title customer", email: `${prefix}-customer@example.test`, emailVerifiedAt: new Date() } }); users.push(customer.id);
  const workspace = await prisma.workspace.create({ data: { name: "Title workspace", slug: prefix, ownerId: customer.id, members: { create: { userId: customer.id } } } });
  const ticket = await prisma.supportTicket.create({ data: { reference: prefix, workspaceId: workspace.id, requesterUserId: customer.id, title: "Title fixture question", category: "GENERAL" } });
  const invite = await prisma.referralAccessInvite.create({ data: { recipientEmail: `${prefix}-invite@example.test`, source: "WAITLIST_MANUAL", tokenHash: prefix, tokenCiphertext: "test-only" } });
  const delivery = await prisma.waitlistDelivery.create({ data: { inviteId: invite.id, status: "SENT", messageCiphertext: "test-only" } });
  const suppression = await prisma.emailSuppression.create({ data: { email: `${prefix}-blocked@example.test`, reason: "HARD_BOUNCE" } });
  try {
    const entry = await prisma.sharedMix.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    expect(entry, "the seeded library has an entry to review").toBeTruthy();
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const area of ADMIN_AREAS) {
      const heading = await expectTitleMatchesHeading(page, area.href);
      expect(heading, `${area.href}: the H1 is the area's one name`).toBe(adminAreaName(area.href));
      await expect(page.locator(".admin-sidebar-heading span")).toHaveText(`Administration · ${heading}`);
      const tab = page.locator('.admin-area-tabs [aria-current="page"]');
      if (await tab.count()) await expect(tab, `${area.href}: the area tab`).toHaveText(heading);
    }
    const records = { "/admin/access/{id}": invite.id, "/admin/email/recovery/{id}": delivery.id, "/admin/email/suppressions/{id}": suppression.id, "/admin/support/{id}": ticket.id, "/admin/templates/{id}/edit": entry!.id, "/admin/users/{id}": customer.id } as Record<string, string>;
    const others = ["/admin/access-denied?capability=users.read", "/account/admin-mfa", "/account/admin-mfa?verify=1", "/admin/templates/new",
      ...RECORD_PAGES.filter(path => records[path]).map(path => path.replace("{id}", records[path]))];
    for (const path of others) await expectTitleMatchesHeading(page, path);
    for (const path of RECORD_PAGES.map(path => path.replace("{id}", `missing-${randomUUID()}`))) {
      const heading = await expectTitleMatchesHeading(page, path);
      expect(heading, `${path}: the staff not-found`).toBe("This record isn’t available");
    }
    expect(await expectTitleMatchesHeading(page, `/admin/support/${ticket.id}`)).toBe("Title fixture question");
    expect(await expectTitleMatchesHeading(page, `/admin/users/${customer.id}`)).toBe("Title customer");

    // Sidebar "Customers" leads to H1 "Customers" (JITM-09 §2.66), by keyboard.
    await openHeading(page, "/admin");
    await page.getByRole("navigation", { name: "Administration" }).getByRole("link", { name: "Customers", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.locator("h1")).toHaveText("Customers");
    await expect(page).toHaveTitle(`Customers${TITLE_SUFFIX}`);
    // Staff library content says "Library" (Q4), and "Preview and publish" has one spelling.
    await openHeading(page, "/admin/templates");
    await expect(page.getByRole("searchbox", { name: "Search the library", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create a library draft", exact: true })).toBeVisible();
    await expect(page.locator(".page-header")).not.toContainText(/ready-made/i);
    await openHeading(page, `/admin/templates/${entry!.id}/edit`);
    await expect(page.getByRole("link", { name: "Back to Library", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Preview and publish/ })).toHaveCount(1);
    await expect(page.locator("main")).not.toContainText("Preview & publish");

    // A staff member without a password or MFA sees the password step under its own name.
    const unenrolled = await staffMember(page, `${prefix}-unenrolled`, { mfa: false }); users.push(unenrolled.id);
    expect(await expectTitleMatchesHeading(page, "/account/admin-mfa")).toBe("Secure administrator access");
    // The staff invitation page names its state in the tab too.
    await page.context().clearCookies();
    expect(await expectTitleMatchesHeading(page, "/staff/accept")).toBe("This invitation link is incomplete");
    expect(await expectTitleMatchesHeading(page, `/staff/accept?token=${randomBytes(32).toString("base64url")}`)).toBe("This invitation isn’t available");
  } finally {
    await prisma.supportTicket.deleteMany({ where: { id: ticket.id } });
    await prisma.waitlistDelivery.deleteMany({ where: { id: delivery.id } });
    await prisma.referralAccessInvite.deleteMany({ where: { id: invite.id } });
    await prisma.emailSuppression.deleteMany({ where: { id: suppression.id } });
    await prisma.workspace.deleteMany({ where: { id: workspace.id } });
    await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
});

test("renamed staff pages and tabs fit every staff width, both themes, a short screen, 110% zoom and 200% text", async ({ page }) => {
  test.setTimeout(300_000);
  const prefix = `ux-names-${randomUUID()}`;
  const owner = await staffMember(page, prefix);
  try {
    for (const path of ["/admin/users", "/admin/templates", "/admin/reports/history", "/admin/reports/exports", "/admin/operations/alerts", "/admin/email/suppressions", "/admin/team"]) {
      const heading = await openHeading(page, path);
      const check = async (label: string, width: number) => {
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${label}: no sideways page scroll`).toBeLessThanOrEqual(1);
        const box = await page.locator("h1").boundingBox();
        expect(box && box.x >= 0 && box.x + box.width <= width + 1, `${label}: the H1 "${heading}" stays on screen`).toBe(true);
      };
      for (const colorScheme of ["light", "dark"] as const) for (const width of NAME_WIDTHS) {
        await applyRenderedTheme(page, colorScheme, { width, height: 900 });
        await check(`${path} ${colorScheme} ${width}px`, width);
      }
      await applyRenderedTheme(page, "light", { width: 844, height: 390 });
      await check(`${path} 844x390`, 844);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.evaluate(() => { document.documentElement.style.zoom = "1.1"; });
      await check(`${path} 110% zoom`, 1280);
      await page.evaluate(() => { document.documentElement.style.zoom = ""; });
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      for (const width of [320, 1280]) { await page.setViewportSize({ width, height: 900 }); await check(`${path} ${width}px at 200% text`, width); }
    }
  } finally {
    await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: owner.id } });
    await prisma.user.delete({ where: { id: owner.id } });
  }
});
