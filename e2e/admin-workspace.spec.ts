import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";
import { createSupportFixture } from "../tests/helpers/support-fixture";
import { EMPTY_LIBRARY_CONTENT } from "../src/lib/library-content";

const enabled = process.env.ADMIN_UX_E2E === "1" && process.env.AUTH_REQUIRE_ADMIN_MFA === "true" && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!enabled, "Requires isolated local admin UX fixtures with MFA enabled.");
test.use({ screenshot: "off", video: "off", trace: "off" });
const userIds: string[] = [], mixIds: string[] = [];
let originalMonitor: Awaited<ReturnType<typeof prisma.operationsMonitor.findUnique>> | undefined;
async function identity() {
  const user = await prisma.user.create({ data: { name: "Admin UX fixture", email: `admin-ux-${randomUUID()}@example.test`, emailVerifiedAt: new Date(), staffMembership: { create: { role: "OWNER" } } } });
  userIds.push(user.id);
  const token = randomBytes(32).toString("base64url");
  const session = await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  await prisma.adminMfaCredential.create({ data: { userId: user.id, enabledAt: new Date(), secretCiphertext: "admin-ux-fixture" } });
  await prisma.adminMfaSession.create({ data: { userId: user.id, sessionId: session.id, expiresAt: session.expiresAt } });
  return { user, token };
}
test.afterEach(async () => {
  if (originalMonitor !== undefined) {
    if (originalMonitor) await prisma.operationsMonitor.upsert({ where: { id: "primary" }, create: originalMonitor, update: originalMonitor });
    else await prisma.operationsMonitor.deleteMany({ where: { id: "primary" } });
    originalMonitor = undefined;
  }
  await prisma.sharedMixMetadata.deleteMany({ where: { sharedMixId: { in: mixIds } } });
  await prisma.sharedMix.deleteMany({ where: { id: { in: mixIds } } });
  await prisma.adminMfaSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.adminMfaCredential.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userPreference.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  userIds.length = 0; mixIds.length = 0;
});

test("overview highlights missing monitoring, respects roles, and offers a usable mobile menu", async ({ page, context }, info) => {
  const { user, token } = await identity();
  originalMonitor = await prisma.operationsMonitor.findUnique({ where: { id: "primary" } });
  await prisma.operationsMonitor.upsert({ where: { id: "primary" }, create: { id: "primary" }, update: { observedAt: null, lastError: null } });
  await context.addCookies([{ name: "jitm_session", value: token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Monitoring needs a check/ })).toBeVisible();
  await expect(page.locator(".admin-pulse-item")).toHaveCount(3);
  for (const colorScheme of ["light", "dark"] as const) for (const width of [320, 768, 1440]) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 1000 });
    if (width === 320) {
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      await expect(page.getByRole("navigation", { name: "Administration" }).getByRole("link", { name: "Team", exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    if (width === 320) await page.getByRole("button", { name: "Close menu", exact: true }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("navigation", { name: "Administration" }).getByRole("link", { name: "Ready-made mixes", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/templates$/);
  await expect(page.getByRole("button", { name: "Menu", exact: true })).toHaveAttribute("aria-expanded", "false");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Admin · Overview" })).toBeVisible();
  await prisma.staffMembership.update({ where: { userId: user.id }, data: { role: "ANALYST" } });
  await page.reload();
  await expect(page.getByRole("link", { name: /Monitoring needs a check/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Create a library draft/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Explore reports/ })).toBeVisible();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Administration" }).getByRole("link", { name: "Team", exact: true })).toHaveCount(0);
});

test("content search, visibility, ordering and pagination work together without losing filters", async ({ page, context }, info) => {
  const { token } = await identity();
  await context.addCookies([{ name: "jitm_session", value: token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  const prefix = `UX library ${randomUUID().slice(0, 8)}`;
  for (let i = 0; i < 27; i++) {
    const row = await prisma.sharedMix.create({ data: { title: `${prefix} ${String(i).padStart(2, "0")}`, description: "A prepared check-in for the compact content library.", category: "Follow-up", durationDays: 0, steps: EMPTY_LIBRARY_CONTENT.steps, status: i === 26 ? "UNPUBLISHED" : "APPROVED", importCount: i } });
    mixIds.push(row.id);
  }
  await page.goto("/admin/templates");
  await page.getByRole("searchbox", { name: "Search ready-made mixes" }).fill(prefix);
  await page.getByLabel("Sort mixes").selectOption("title");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".admin-library-row")).toHaveCount(25);
  await expect(page.locator(".admin-library-row").first()).toContainText(`${prefix} 00`);
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(page.locator(".admin-library-row")).toHaveCount(2);
  await expect(page.getByRole("searchbox", { name: "Search ready-made mixes" })).toHaveValue(prefix);
  await page.getByRole("navigation", { name: "Library visibility" }).getByRole("link", { name: /Drafts & hidden/ }).click();
  await expect(page.locator(".admin-library-row")).toHaveCount(1);
  await expect(page.locator(".admin-library-row")).toContainText(`${prefix} 26`);
  await expect(page.getByRole("navigation", { name: "Library pages" })).toContainText("Page 1 of 1");
  for (const colorScheme of ["light", "dark"] as const) for (const width of [320, 768, 1440]) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" }); await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
  await page.getByRole("navigation", { name: "Library visibility" }).getByRole("link", { name: /All mixes/ }).click();
  await page.getByLabel("Sort mixes").selectOption("popular");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".admin-library-row").first()).toContainText(`${prefix} 26`);
  await page.getByRole("searchbox", { name: "Search ready-made mixes" }).fill(`${prefix} missing`);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No mixes match these filters" })).toBeVisible();
  await page.getByRole("link", { name: "Show all mixes", exact: true }).click();
  await expect(page.locator(".admin-library-row")).toHaveCount(25);
});


test("overview support action opens only conversations needing a reply and preserves that filter", async ({ page, context }, info) => {
  const fixture = await createSupportFixture();
  try {
    const marker = `Queue ${randomUUID().slice(0, 8)}`;
    await prisma.supportTicket.update({ where: { id: fixture.ticket.id }, data: { title: `${marker} new request` } });
    for (const status of ["WAITING_ON_SUPPORT", "WAITING_ON_USER", "CLOSED"] as const) {
      await prisma.supportTicket.create({ data: { reference: `UX-${randomUUID()}`, workspaceId: fixture.workspace.id, requesterUserId: fixture.customer.user.id, title: `${marker} ${status}`, category: "JUMPS", status } });
    }
    await context.addCookies([{ name: "jitm_session", value: fixture.admin.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
    await page.goto("/admin");
    await page.getByRole("link", { name: /Support is waiting on a reply/ }).click();
    await expect(page).toHaveURL(/status=attention$/);
    await expect(page.getByRole("combobox", { name: "Status", exact: true })).toHaveValue("attention");
    await page.getByRole("textbox", { name: "Search", exact: true }).fill(marker);
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.locator(".support-admin-ticket")).toHaveCount(2);
    await expect(page.locator(".support-admin-ticket-list")).toContainText("new request");
    await expect(page.locator(".support-admin-ticket-list")).toContainText("WAITING_ON_SUPPORT");
    await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("all");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.locator(".support-admin-ticket")).toHaveCount(4);
  } finally { await fixture.cleanup(); }
});
