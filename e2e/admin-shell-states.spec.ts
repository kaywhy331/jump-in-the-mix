import { createHash, randomBytes, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { ADMIN_AREAS, type AdminPermission } from "../src/lib/admin-permissions";
import { activeAdminArea } from "../src/lib/admin-navigation";
import { reportDefinitionKey } from "../src/lib/report-storage-policy";
import { applyRenderedTheme } from "./theme-fixture";

const database = new URL(process.env.DATABASE_URL ?? "postgresql://localhost/unknown");
test.skip(!["localhost", "127.0.0.1"].includes(database.hostname) || !database.pathname.startsWith("/jitm_design_"), "Disposable fixtures only");
test.setTimeout(300_000);

/** The slice's widths (JITM-UXS-03): a phone and a desktop. */
const WIDTHS = [390, 1440] as const;
/** Every page under the staff layout. */
const STAFF_ROUTES = [...ADMIN_AREAS.map(area => area.href), "/admin/access-denied", "/account/admin-mfa"];
/** The staff lists whose records open on a page of their own. */
const RECORD_LISTS = ["/admin/access", "/admin/email/recovery", "/admin/email/suppressions", "/admin/reports/history", "/admin/support"];
const OWNER_PERMISSIONS = ADMIN_AREAS.map(area => area.permission) as AdminPermission[];
const WCAG = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

/** A synthetic staff member (an owner unless named) with verified MFA, signed in to this browser. */
async function signInStaffOwner(page: Page, role: "OWNER" | "OPERATOR" = "OWNER") {
  const prefix = `shell-${randomUUID()}`;
  const user = await prisma.user.create({ data: { name: "Shell staff", email: `${prefix}@example.test`, emailVerifiedAt: new Date(), staffMembership: { create: { role } } } });
  const token = randomBytes(32).toString("base64url");
  const session = await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  await prisma.adminMfaCredential.create({ data: { userId: user.id, enabledAt: new Date(), secretCiphertext: "synthetic-shell-fixture" } });
  await prisma.adminMfaSession.create({ data: { userId: user.id, sessionId: session.id, expiresAt: session.expiresAt } });
  await page.context().addCookies([{ name: "jitm_session", value: token, url: process.env.PLAYWRIGHT_BASE_URL!, httpOnly: true, sameSite: "Strict" }]);
  return async () => {
    await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  };
}

/** Opens a staff page once the shell is shown (no browser session check is hiding it). */
async function openStaffPage(page: Page, path: string) {
  const response = await page.goto(path);
  await expect(page.locator(".staff-shell")).toBeVisible();
  await expect(page.getByText("Checking your staff session…")).toHaveCount(0);
  return response;
}

async function expectNoSidewaysScroll(page: Page, label: string) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), label).toBeLessThanOrEqual(1);
}

test("the first Tab stop on every staff page is Skip to content, and it lands on the main content", async ({ page }) => {
  const cleanup = await signInStaffOwner(page);
  try {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 844 });
      for (const path of STAFF_ROUTES) {
        await openStaffPage(page, path);
        await page.keyboard.press("Tab");
        const skip = page.getByRole("link", { name: "Skip to content" });
        await expect(skip, `${path} at ${width}px`).toBeFocused();
        await expect(skip).toHaveClass(/\bpublic-skip-link\b/);
        await expect.poll(async () => { const box = await skip.boundingBox(); return Boolean(box && box.y >= 0 && box.x >= 0 && box.x + box.width <= width); }, `${path}: the focused skip link is on screen`).toBe(true);
        await page.keyboard.press("Enter");
        const main = page.locator("main#main-content");
        await expect(main, `${path}: Enter moves focus to the main content`).toBeFocused();
        await expect(main).toHaveAttribute("tabindex", "-1");
        await page.keyboard.press("Tab");
        expect(await page.evaluate(() => Boolean(document.activeElement?.closest("#main-content"))), `${path}: the next Tab stays in the main content`).toBe(true);
      }
    }
  } finally { await cleanup(); }
});

test("a missing staff record opens the staff not-found inside the admin shell, with a way back to its list", async ({ page }) => {
  const cleanup = await signInStaffOwner(page);
  try {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 844 });
      for (const list of RECORD_LISTS) {
        const path = `${list}/missing-${randomUUID()}`;
        const response = await openStaffPage(page, path);
        // With the admin loading state, the response streams before the page finds the record is missing (JITM-UXS-03 default decision).
        expect([200, 404], path).toContain(response?.status());
        test.info().annotations.push({ type: "missing-record-status", description: `${width}px ${list} ${response?.status()}` });
        await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
        await expect(page.getByRole("navigation", { name: "Administration" })).toBeVisible();
        await expect(page.locator(".admin-workspace-main h1")).toHaveText("This record isn’t available");
        await expect(page.locator("h1")).toHaveCount(1);
        await expect(page.getByRole("heading", { name: "Let’s get you back on track." })).toHaveCount(0);
        const area = activeAdminArea(path, OWNER_PERMISSIONS)!;
        expect(area.href).toBe(list);
        const back = page.locator(".admin-workspace-main").getByRole("link", { name: `Back to ${area.label}` });
        await expect(back).toBeVisible();
        await expect(back).toHaveAttribute("href", list);
        await expectNoSidewaysScroll(page, `${path} at ${width}px`);
      }
    }
    await openStaffPage(page, `/admin/support/missing-${randomUUID()}`);
    await page.locator(".admin-workspace-main").getByRole("link", { name: "Back to Support" }).click();
    await expect(page).toHaveURL(/\/admin\/support$/);
    await expect(page.locator(".admin-workspace-main h1")).not.toHaveText("This record isn’t available");
  } finally { await cleanup(); }
});

test("a loading staff page shows its placeholder inside the admin shell", async ({ page }) => {
  const cleanup = await signInStaffOwner(page);
  try {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 844 });
      await openStaffPage(page, "/admin");
      // Hold only the Support queue's own read: the shell renders, and the queue stays loading until it is checked.
      let release!: () => void, locked!: () => void;
      const released = new Promise<void>(resolve => { release = resolve; });
      const lockTaken = new Promise<void>(resolve => { locked = resolve; });
      const hold = prisma.$transaction(async tx => {
        await tx.$executeRaw`LOCK TABLE "SupportTicket" IN ACCESS EXCLUSIVE MODE`;
        locked();
        await released;
      }, { maxWait: 10_000, timeout: 60_000 });
      try {
        await lockTaken;
        const navigation = page.getByRole("navigation", { name: "Administration" });
        const menu = navigation.getByRole("button", { name: "Menu" });
        if (await menu.isVisible()) await menu.click();
        await navigation.getByRole("link", { name: "Support", exact: true }).click();
        const loading = page.locator(".admin-workspace-main").getByRole("status");
        await expect(loading.getByRole("heading", { level: 1, name: "Loading staff page…" })).toBeVisible();
        await expect(loading).toHaveAttribute("aria-busy", "true");
        await expect(loading.locator(".card[aria-hidden='true']")).toHaveCount(2);
        for (const card of await loading.locator(".card").all()) expect((await card.boundingBox())?.height, `${width}px placeholder card`).toBeGreaterThan(0);
        await expect(navigation).toBeVisible();
        await expect(page.locator(".staff-shell .public-header")).toBeVisible();
        await expect(page.locator("h1")).toHaveCount(1);
        await expectNoSidewaysScroll(page, `loading at ${width}px`);
      } finally { release(); await hold; }
      await expect(page).toHaveURL(/\/admin\/support$/);
      await expect(page.locator(".admin-workspace-main").getByRole("status").getByRole("heading", { name: "Loading staff page…" })).toHaveCount(0);
      await expect(page.locator(".admin-workspace-main h1")).toBeVisible();
    }
  } finally { await cleanup(); }
});

test("a staff page that fails offers Try again and a staff next step inside the admin shell", async ({ page }) => {
  const cleanup = await signInStaffOwner(page);
  // A saved report whose stored payload is empty makes the saved-report page fail while it renders.
  const day = new Date(Date.UTC(1990, 0, 1) + Math.floor(Math.random() * 3650) * 86_400_000);
  const broken = await prisma.reportDailySnapshot.create({ data: { day, definitionKey: reportDefinitionKey(), status: "READY", payload: {}, observedAt: new Date() } });
  try {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 844 });
      await openStaffPage(page, `/admin/reports/history/${broken.id}`);
      const main = page.locator(".admin-workspace-main");
      await expect(main.getByRole("heading", { level: 1, name: "This staff page didn’t load" })).toBeVisible();
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.getByRole("heading", { name: "We couldn’t open this page." })).toHaveCount(0);
      await expect(page.getByRole("navigation", { name: "Administration" })).toBeVisible();
      await expect(main.getByRole("button", { name: "Try again" })).toBeVisible();
      await expect(main.getByRole("link", { name: "Back to Report history" })).toHaveAttribute("href", "/admin/reports/history");
      await expect(main.locator("code")).not.toBeEmpty();
      await expectNoSidewaysScroll(page, `error at ${width}px`);
    }
    // Try again reads the page again: once the broken report is gone, the same place shows the missing-record state.
    await prisma.reportDailySnapshot.delete({ where: { id: broken.id } });
    await page.locator(".admin-workspace-main").getByRole("button", { name: "Try again" }).click();
    await expect(page.locator(".admin-workspace-main h1")).toHaveText("This record isn’t available");
    await expect(page.locator(".admin-workspace-main").getByRole("link", { name: "Back to Report history" })).toBeVisible();
  } finally {
    await prisma.reportDailySnapshot.deleteMany({ where: { id: broken.id } });
    await cleanup();
  }
});

test("the staff states hold in both themes, at 200% text, on short screens and at 110% zoom", async ({ page }) => {
  const cleanup = await signInStaffOwner(page);
  const missing = `/admin/email/recovery/missing-${randomUUID()}`;
  try {
    for (const colorScheme of ["light", "dark"] as const) {
      for (const viewport of [{ width: 390, height: 844 }, { width: 760, height: 900 }, { width: 761, height: 900 }, { width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 1440, height: 480 }]) {
        await openStaffPage(page, missing);
        await applyRenderedTheme(page, colorScheme, viewport);
        const label = `${colorScheme} ${viewport.width}×${viewport.height}`;
        await expectNoSidewaysScroll(page, label);
        const back = page.locator(".admin-workspace-main").getByRole("link", { name: "Back to Email recovery" });
        await back.scrollIntoViewIfNeeded();
        await expect(back, label).toBeInViewport();
        const audited = viewport.width === 390 || viewport.width === 1440 && viewport.height === 900;
        if (audited) expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations, label).toEqual([]);
        await page.keyboard.press("Tab");
        await expect(page.getByRole("link", { name: "Skip to content" }), label).toBeFocused();
        // Shown only while focused, the skip link covers the logo, so its own audit is contrast.
        if (audited) expect((await new AxeBuilder({ page }).include(".public-skip-link").withRules(["color-contrast"]).analyze()).violations, `${label} skip link`).toEqual([]);
      }
      await openStaffPage(page, missing);
      await applyRenderedTheme(page, colorScheme, { width: 390, height: 844 });
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await expectNoSidewaysScroll(page, `${colorScheme} 390px at 200% text`);
      await expect(page.locator(".admin-workspace-main h1")).toBeVisible();
      await openStaffPage(page, missing);
      await applyRenderedTheme(page, colorScheme, { width: 1440, height: 900 });
      await page.evaluate(() => { document.documentElement.style.zoom = "1.1"; });
      expect(await page.evaluate(() => window.innerWidth / Number(getComputedStyle(document.documentElement).zoom)), "110% zoom gives a fractional width").not.toBe(1440);
      await expectNoSidewaysScroll(page, `${colorScheme} 1440px at 110% zoom`);
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    }
  } finally { await cleanup(); }
});

test("a staff page the member may not open still goes to the permission page, with none of its content", async ({ page }) => {
  const cleanup = await signInStaffOwner(page, "OPERATOR");
  try {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/admin/team");
      await expect(page).toHaveURL(/\/admin\/access-denied\?capability=staff\.manage$/);
      await expect(page.getByRole("heading", { level: 1, name: "This area needs another permission" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Team", exact: true })).toHaveCount(0);
    }
    const response = await page.request.get("/admin/team", { maxRedirects: 0 });
    const body = await response.text();
    test.info().annotations.push({ type: "denied-status", description: String(response.status()) });
    expect([200, 307], "a denial is a redirect, sent before or within the response").toContain(response.status());
    if (response.status() === 307) expect(response.headers().location).toBe("/admin/access-denied?capability=staff.manage");
    else expect(body).toContain("/admin/access-denied?capability=staff.manage");
    expect(body).not.toContain("<h1>Team</h1>");
    expect(body).not.toContain("Add a person");
  } finally { await cleanup(); }
});
