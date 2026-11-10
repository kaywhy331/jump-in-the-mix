import { execFileSync } from "node:child_process";
import { expect, test, type BrowserContext } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { generateTotpCode } from "../src/lib/totp";
import { assertSeedDatabase, STAFF_LIST_FIXTURES } from "../scripts/seed-e2e-admin";
import { applyRenderedTheme } from "./theme-fixture";

// Run explicitly with ADMIN_UX_E2E=1 after the demo seed. The ordinary browser
// suite keeps its empty-list fixtures; this file opts in through the seed CLI.
const enabled = process.env.ADMIN_UX_E2E === "1";
test.skip(!enabled, "Requires the opt-in staff UX suite and a disposable local database.");
test.use({ screenshot: "off", video: "off", trace: "off" });

const LISTS = [
  { name: "Support", path: "/admin/support", selector: ".support-admin-ticket", field: "title" },
  { name: "Waitlist", path: "/admin/waitlist", selector: ".admin-queue-row", field: "email" },
  { name: "Email recovery", path: "/admin/email/recovery", selector: ".admin-queue-row", field: "email" },
  { name: "Email suppressions", path: "/admin/email/suppressions", selector: ".admin-queue-row", field: "email" },
  { name: "Invitations", path: "/admin/access", selector: ".admin-queue-row", field: "email" },
  { name: "Team invitations", path: "/admin/team?view=invitations", selector: ".card", field: "email" },
  { name: "Audit", path: "/admin/audit?scope=platform", selector: ".admin-audit-card", field: "title" },
  { name: "Community reports", path: "/admin/marketplace", selector: ".admin-marketplace-row", field: "title" }
] as const;

// JITM-07 §5 plus the staff shell's 430, 760, 980 and 1100 boundaries.
const VIEWPORTS = [
  { width: 320, height: 640 }, { width: 390, height: 844 },
  ...[429, 430, 431, 599, 600, 601, 759, 760, 761, 767, 768, 900, 901, 979, 980, 981, 1099, 1100, 1101, 1279, 1280, 1440, 1920].map(width => ({ width, height: 900 })),
  { width: 667, height: 375 }, { width: 844, height: 390 },
  { width: 1280, height: 479 }, { width: 1280, height: 480 }
];
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;

async function fixtureCounts() {
  const where = { id: { in: STAFF_LIST_FIXTURES.map(row => row.id) } };
  return Promise.all([
    prisma.supportTicket.count({ where }), prisma.waitlistEntry.count({ where }),
    prisma.waitlistDelivery.count({ where }), prisma.emailSuppression.count({ where }),
    prisma.referralAccessInvite.count({ where }), prisma.staffInvitation.count({ where }),
    prisma.platformAuditEvent.count({ where }), prisma.marketplaceReport.count({ where })
  ]);
}

test.beforeAll(async ({ browser }) => {
  assertSeedDatabase();
  expect(process.env.AUTH_REQUIRE_ADMIN_MFA).toBe("true");
  const runSeed = (args: string[] = []) => execFileSync(process.execPath, ["--import", "tsx", "scripts/seed-e2e-admin.ts", ...args], { env: process.env, stdio: "pipe" });
  const before = await fixtureCounts();
  runSeed();
  expect(await fixtureCounts(), "The default admin seed must not add staff list rows").toEqual(before);
  runSeed(["--staff-lists"]);
  const populated = await fixtureCounts();
  expect(populated).toEqual(LISTS.map(() => STAFF_LIST_FIXTURES.length));
  runSeed(["--staff-lists"]);
  expect(await fixtureCounts(), "Opting in again must not duplicate rows").toEqual(populated);
  const deliveries = await prisma.waitlistDelivery.findMany({ where: { id: { in: STAFF_LIST_FIXTURES.map(row => row.id) } } });
  expect(deliveries.every(row => row.status === "REVIEW" && !row.messageCiphertext)).toBe(true);

  // Use the shipped login and MFA enrollment flow; never bypass staff access.
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const password = process.env.E2E_ADMIN_PASSWORD ?? "AdminJumpInTheMix123!";
    await page.goto(`${process.env.PLAYWRIGHT_BASE_URL}/login`);
    await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL ?? "admin-e2e@jumpinthemix.local");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(/\/(jumps|onboarding)(\?|$)/);
    await page.goto(`${process.env.PLAYWRIGHT_BASE_URL}/admin`);
    const secret = (await page.getByTestId("mfa-secret").textContent())!.trim();
    await page.getByLabel("Current password").fill(password);
    await page.getByLabel("Authenticator code").fill(generateTotpCode(secret));
    await page.getByRole("button", { name: "Enable administrator MFA" }).click();
    await page.getByRole("checkbox", { name: "I stored my one-time recovery codes securely." }).check();
    await page.getByRole("button", { name: "Continue to Admin" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Overview", exact: true })).toBeVisible();
    cookies = await context.cookies();
  } finally { await context.close(); }
});

test("the seed refuses missing, default, remote and query-overridden databases before connecting", () => {
  for (const value of [undefined, "", "not a URL", "postgresql://localhost/jitm", "postgresql://localhost/jitm_design_", "postgresql://remote.example.test/jitm_design_uxs08", "postgresql://localhost/jitm_design_uxs08?host=remote.example.test", "postgresql://localhost/jitm_design_uxs08?dbname=jitm", "https://localhost/e2e"]) {
    expect(() => assertSeedDatabase(value ?? "")).toThrow(/requires DATABASE_URL/);
  }
  for (const value of ["postgresql://localhost/jitm_design_uxs08?schema=public", "postgres://127.0.0.1/e2e", "postgresql://[::1]/jitm_e2e"]) {
    expect(() => assertSeedDatabase(value)).not.toThrow();
  }
  for (const database of ["", "postgresql://localhost/jitm", "postgresql://remote.example.test/jitm_design_uxs08"]) {
    expect(() => execFileSync(process.execPath, ["--import", "tsx", "scripts/seed-e2e-admin.ts", "--staff-lists"], { env: { ...process.env, DATABASE_URL: database }, stdio: "pipe" })).toThrow(/requires DATABASE_URL/);
  }
});

for (const list of LISTS) {
  test(`${list.name} shows long fictional rows without page overflow`, async ({ page, context }, info) => {
    await context.addCookies(cookies);
    await page.goto(list.path);
    await expect(page.getByText("Checking your staff session…")).toHaveCount(0);
    const rows = STAFF_LIST_FIXTURES.map(row => page.locator(`.admin-workspace-main ${list.selector}`).filter({ hasText: row[list.field] }));
    for (const row of rows) await expect(row).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main-content")).toBeFocused();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest("#main-content")))).toBe(true);

    const check = async (label: string) => {
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), label).toBeLessThanOrEqual(1);
      for (const row of rows) await expect(row, label).toBeVisible();
    };
    for (const theme of ["light", "dark"] as const) {
      for (const viewport of VIEWPORTS) {
        await applyRenderedTheme(page, theme, viewport);
        await check(`${list.path} ${theme} ${viewport.width}×${viewport.height}`);
        if (viewport.width === 390 || viewport.width === 1440) {
          const screenshot = await page.screenshot({ path: info.outputPath(`${theme}-${viewport.width}.png`), fullPage: true, scale: "css" });
          expect(screenshot.readUInt32BE(16)).toBe(viewport.width);
          expect(screenshot.readUInt32BE(20)).toBeGreaterThan(0);
        }
      }
      for (const width of [320, 390, 430, 1440]) {
        await applyRenderedTheme(page, theme, { width, height: 900 });
        await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
        await check(`${list.path} ${theme} ${width} at 200% text`);
        await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
      }
      await applyRenderedTheme(page, theme, { width: 837, height: 900 });
      await page.evaluate(() => { document.documentElement.style.zoom = "1.1"; });
      const effective = await page.evaluate(() => innerWidth / Number(getComputedStyle(document.documentElement).zoom));
      expect(effective).toBeGreaterThan(760);
      expect(effective).toBeLessThan(761);
      await check(`${list.path} ${theme} 110% zoom, effective width ${effective}`);
      await page.evaluate(() => { document.documentElement.style.zoom = ""; });
    }
  });
}
