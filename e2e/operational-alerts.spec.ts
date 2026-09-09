import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";
import { createOperationsFixture, healthyOperationsObservations } from "../tests/helpers/operations-fixture";
import { acquireOperationsMonitor, saveOperationsObservations } from "../src/lib/operations-alerts";
import { clearRateLimit } from "../src/lib/rate-limit";
const enabled = process.env.OPS_ALERTS_E2E === "1" && process.env.AUTH_REQUIRE_ADMIN_MFA === "true" && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!enabled, "Requires isolated operations fixtures and administrator MFA.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 20_000 });
let f: Awaited<ReturnType<typeof createOperationsFixture>>;
test.beforeEach(async ({ context }, info) => { f = await createOperationsFixture(); await context.addCookies([{ name: "jitm_session", value: f.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]); });
test.afterEach(async () => { if (!f) return; await clearRateLimit("admin.ops-acknowledge", [f.user.id]); await f.cleanup(); });
async function observations() {
  const lease = await acquireOperationsMonitor();
  await saveOperationsObservations(lease!, healthyOperationsObservations().map(item => item.code === "worker" ? { ...item, state: "CRITICAL", evidence: { ageSeconds: 300, limitSeconds: 90 } } : item.code === "backup" ? { ...item, state: "UNKNOWN", evidence: { ageHours: null, limitHours: 36 } } : item));
}
function workerCard(page: import("@playwright/test").Page) { return page.locator("section.card").filter({ has: page.getByRole("heading", { level: 2, name: "Worker heartbeat", exact: true }) }); }
async function layout(page: import("@playwright/test").Page) { for (const width of [320, 1440]) for (const theme of ["light", "dark"]) { await page.setViewportSize({ width, height: 900 }); await page.evaluate(value => document.documentElement.setAttribute("data-theme", value), theme); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true); expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]); } }

test("an administrator acknowledges the incident through its actual action without marking the problem healthy", async ({ page }) => {
  await observations(); await page.goto("/admin/operations"); await page.getByRole("link", { name: "Operational alerts", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Operational alerts", exact: true })).toBeVisible(); await layout(page);
  const card = workerCard(page); await expect(card).toContainText("CRITICAL");
  await card.getByRole("textbox", { name: "Reason for acknowledgment", exact: true }).fill("I am investigating the worker supervisor and its last restart.");
  await card.getByRole("button", { name: "Acknowledge alert" }).click();
  await expect(page).toHaveURL(/acknowledged=1$/); await expect(page.locator(".notice.success")).toContainText("problem stays open");
  await expect(card).toContainText("underlying check remains critical"); await expect(card.getByRole("button", { name: "Acknowledge alert" })).toHaveCount(0);
  const row = await prisma.operationsCheck.findUniqueOrThrow({ where: { code: "worker" } }); expect(row.state).toBe("CRITICAL"); expect(row.acknowledgedBy).toBe(f.user.id);
  expect(await prisma.operationsNotice.count({ where: { code: "worker", status: "CANCELED" } })).toBe(1);
  expect(await page.content()).not.toContain(f.email);
});

test("changed evidence rejects a stale form and permission removal prevents acknowledgment", async ({ page }) => {
  await observations(); await page.goto("/admin/operations/alerts"); const card = workerCard(page);
  await card.getByRole("textbox", { name: "Reason for acknowledgment", exact: true }).fill("Review the latest worker incident and restart history.");
  await prisma.operationsCheck.update({ where: { code: "worker" }, data: { evidence: { ageSeconds: 900, limitSeconds: 90 }, revision: { increment: 1 } } });
  await card.getByRole("button", { name: "Acknowledge alert" }).click(); await expect(page.locator(".notice.error")).toContainText("alert changed");
  await card.getByRole("textbox", { name: "Reason for acknowledgment", exact: true }).fill("Review the latest worker incident and restart history.");
  await prisma.staffMembership.update({ where: { userId: f.user.id }, data: { denies: ["operations.manage"] } });
  await card.getByRole("button", { name: "Acknowledge alert" }).click(); await expect(page).toHaveURL(/access-denied/);
  expect((await prisma.operationsCheck.findUniqueOrThrow({ where: { code: "worker" } })).acknowledgedAt).toBeNull();
});

test("missing and stale monitoring fails its health endpoint and stays distinct from the saved checks", async ({ page, request }) => {
  let response = await request.get("/api/health/monitor"); expect(response.status()).toBe(503); expect(await response.json()).toEqual({ status: "not-ready" });
  await page.goto("/admin/operations/alerts"); await expect(page.locator(".notice.error")).toContainText("monitoring is missing"); await expect(page.getByText("No independent observations have been recorded.", { exact: false })).toBeVisible();
  await observations(); response = await request.get("/api/health/monitor"); expect(response.status()).toBe(200); expect(response.headers()["cache-control"]).toBe("no-store");
  await prisma.operationsMonitor.update({ where: { id: "primary" }, data: { observedAt: new Date(Date.now() - 20 * 60_000) } });
  await page.reload(); await expect(page.locator(".notice.error")).toContainText("do not establish current health");
  response = await request.get("/api/health/monitor"); expect(response.status()).toBe(503); expect(await response.json()).toEqual({ status: "not-ready" });
});

test("reading diagnostics and using acknowledgments both require current staff MFA and permissions", async ({ page }) => {
  await observations(); await prisma.staffMembership.update({ where: { userId: f.user.id }, data: { denies: ["operations.read"] } });
  await page.goto("/admin/operations/alerts"); await expect(page).toHaveURL(/access-denied/);
  await prisma.staffMembership.update({ where: { userId: f.user.id }, data: { denies: [] } }); await prisma.adminMfaSession.deleteMany({ where: { userId: f.user.id } });
  await page.goto("/admin/operations/alerts"); await expect(page).toHaveURL(/\/account\/admin-mfa/);
});
