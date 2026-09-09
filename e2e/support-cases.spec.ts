import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";
import { createSupportFixture } from "../tests/helpers/support-fixture";
import { clearRateLimit } from "../src/lib/rate-limit";

const enabled = process.env.SUPPORT_CASES_E2E === "1" && process.env.AUTH_REQUIRE_ADMIN_MFA === "true" && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!enabled, "Requires isolated support fixtures and administrator MFA.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 20_000 });
let f: Awaited<ReturnType<typeof createSupportFixture>>;
test.beforeEach(async () => { f = await createSupportFixture(); });
test.afterEach(async () => {
  if (!f) return;
  for (const person of [f.admin, f.colleague]) for (const scope of ["admin.support-view", "admin.support-action"]) await clearRateLimit(scope, [person.user.id]);
  await f.cleanup();
});
async function checkLayout(page: import("@playwright/test").Page) {
  for (const width of [320, 1440]) for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(value => document.documentElement.setAttribute("data-theme", value), theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
}

test("support assigns a case, opens its audited read-only view, and returns to the queue", async ({ page, context }, info) => {
  await context.addCookies([{ name: "jitm_session", value: f.admin.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/admin/support");
  await expect(page.getByRole("heading", { name: "Admin · Support" })).toBeVisible();
  expect(await page.content()).not.toContain("PRIVATE_SUPPORT_BODY_SENTINEL");
  await checkLayout(page);
  expect(await prisma.platformAuditEvent.count({ where: { actorUserId: f.admin.user.id, action: "support.case.read" } })).toBe(0);
  await page.getByRole("link").filter({ hasText: f.ticket.reference }).click();
  await expect(page.getByText("PRIVATE_SUPPORT_BODY_SENTINEL")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start view-only session" })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Assigned to", exact: true }).selectOption(f.admin.user.id);
  await page.getByRole("textbox", { name: "Assignment reason", exact: true }).fill("I will investigate this customer’s missing follow-up.");
  await page.getByRole("button", { name: "Save assignment" }).click();
  await expect(page).toHaveURL(/assignmentSaved=1$/);
  await expect(page.getByRole("button", { name: "Start view-only session" })).toBeVisible();
  await checkLayout(page);
  await page.getByRole("textbox", { name: "Support reason", exact: true }).fill("Review the queue configuration reported in this ticket.");
  await page.getByRole("button", { name: "Start view-only session" }).click();
  await expect(page.locator(".impersonation-banner")).toContainText(f.ticket.reference);
  await expect(page.locator(".impersonation-banner")).toContainText("Private customer");
  const response = await page.goto("/contacts?search=NEVER_LOG_THIS_PRIVATE_SEARCH");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  expect(response?.headers()["referrer-policy"]).toBe("strict-origin");
  const blocked = await page.evaluate(async () => (await fetch("/api/contacts/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: "case-test", contacts: [] }) })).status);
  expect(blocked).toBe(403);
  for (const [origin, site] of [["null", "cross-site"], ["null", "same-site"], ["https://untrusted.example", "same-origin"]]) {
    const rejected = await context.request.post("/api/admin/impersonation/end", { headers: { origin, "sec-fetch-site": site }, maxRedirects: 0 });
    expect(rejected.status()).toBe(403);
  }
  await page.getByRole("button", { name: "End view-only session" }).first().click();
  await expect(page).toHaveURL(/\/admin\/support\?impersonationEnded=1$/);
  await expect(page.getByText("The view-only support session has ended.")).toBeVisible();
  const events = await prisma.platformAuditEvent.findMany({ where: { actorUserId: f.admin.user.id } });
  expect(events.map(row => row.action)).toEqual(expect.arrayContaining(["support.case.read", "support.case.assign", "support.view.start", "support.view.read", "support.view.end"]));
  expect(JSON.stringify(events)).not.toMatch(/PRIVATE_SUPPORT_BODY_SENTINEL|NEVER_LOG_THIS_PRIVATE_SEARCH|test-only-support-credential/);
  const view = await prisma.adminImpersonation.findFirstOrThrow({ where: { actorUserId: f.admin.user.id } });
  expect(view.endedAt).not.toBeNull(); expect(view.actorSessionId).toBe(f.admin.session.id);
});

test("reassignment ends an existing view, rejects a stale form, and a copied cookie cannot cross sessions", async ({ page, context, browser }, info) => {
  const baseURL = info.project.use.baseURL!;
  await prisma.supportTicket.update({ where: { id: f.ticket.id }, data: { assignedToUserId: f.admin.user.id, assignmentRevision: 1 } });
  await context.addCookies([{ name: "jitm_session", value: f.admin.token, url: baseURL, httpOnly: true, sameSite: "Strict" }]);
  await page.goto(`/admin/support/${f.ticket.id}`);
  await page.getByRole("textbox", { name: "Support reason", exact: true }).fill("Investigate the customer’s current jump queue.");
  await page.getByRole("button", { name: "Start view-only session" }).click();
  await expect(page.locator(".impersonation-banner")).toBeVisible();
  const cookie = (await context.cookies()).find(item => item.name === "jitm_impersonation")!;
  const other = await browser.newContext({ baseURL });
  try {
    const token = randomBytes(32).toString("base64url");
    const session = await prisma.session.create({ data: { userId: f.admin.user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
    await prisma.adminMfaSession.create({ data: { userId: f.admin.user.id, sessionId: session.id, expiresAt: session.expiresAt } });
    await other.addCookies([{ name: "jitm_session", value: token, url: baseURL, httpOnly: true, sameSite: "Strict" }, cookie]);
    const second = await other.newPage(); await second.goto("/jumps");
    await expect(second.locator(".impersonation-banner")).toHaveCount(0);
    await expect(second.getByText("Private customer workspace", { exact: true })).toHaveCount(0);
    await other.clearCookies(); await other.addCookies([{ name: "jitm_session", value: f.colleague.token, url: baseURL, httpOnly: true, sameSite: "Strict" }]);
    await second.goto(`/admin/support/${f.ticket.id}`);
    await second.getByRole("combobox", { name: "Assigned to", exact: true }).selectOption(f.colleague.user.id);
    await second.getByRole("textbox", { name: "Assignment reason", exact: true }).fill("Take over this case for the next support shift.");
    await second.getByRole("button", { name: "Save assignment" }).click();
    await expect(second).toHaveURL(/assignmentSaved=1$/);
    await page.goto("/contacts"); await expect(page.locator(".impersonation-banner")).toHaveCount(0);
    await page.getByRole("button", { name: "Clear ended support view" }).click();
    await expect(page).toHaveURL(/\/admin\/support\?impersonationEnded=1$/);
    // A rendered, now-stale assignment revision cannot start a view.
    const stale = await other.request.post("/api/admin/impersonation/start", { headers: { origin: new URL(baseURL).origin }, form: { ticketId: f.ticket.id, assignmentRevision: "1", reason: "Attempt to open the stale support case" }, maxRedirects: 0 });
    expect(stale.status()).toBe(303); expect(stale.headers().location).toContain("error=");
    expect((await prisma.adminImpersonation.findFirstOrThrow({ where: { actorUserId: f.admin.user.id } })).endedAt).not.toBeNull();
  } finally { await other.close(); }
});

test("MFA and separate permissions protect the page and direct start endpoint", async ({ page, context }, info) => {
  const baseURL = info.project.use.baseURL!;
  await context.addCookies([{ name: "jitm_session", value: f.admin.token, url: baseURL, httpOnly: true, sameSite: "Strict" }]);
  await prisma.adminMfaSession.deleteMany({ where: { userId: f.admin.user.id } });
  await page.goto(`/admin/support/${f.ticket.id}`); await expect(page).toHaveURL(/\/account\/admin-mfa/);
  expect(await page.content()).not.toContain("PRIVATE_SUPPORT_BODY_SENTINEL");
  await prisma.adminMfaSession.create({ data: { userId: f.admin.user.id, sessionId: f.admin.session.id, expiresAt: f.admin.session.expiresAt } });
  await prisma.staffMembership.update({ where: { userId: f.admin.user.id }, data: { denies: ["support.view_customer"] } });
  await page.goto(`/admin/support/${f.ticket.id}`); await expect(page.getByText("PRIVATE_SUPPORT_BODY_SENTINEL")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Customer support view" })).toHaveCount(0);
  const start = await context.request.post("/api/admin/impersonation/start", { headers: { origin: new URL(baseURL).origin }, form: { ticketId: f.ticket.id, assignmentRevision: "0", targetUserId: f.customer.user.id, workspaceId: f.workspace.id, reason: "Attempt unauthorized customer access" }, maxRedirects: 0 });
  expect(start.status()).toBe(303); expect(start.headers().location).toContain("access-denied");
  await prisma.staffMembership.update({ where: { userId: f.admin.user.id }, data: { denies: ["support.manage"] } });
  await page.goto(`/admin/support/${f.ticket.id}`); await expect(page).toHaveURL(/access-denied/);
  expect(await page.content()).not.toContain("PRIVATE_SUPPORT_BODY_SENTINEL");
  expect(await prisma.adminImpersonation.count({ where: { actorUserId: f.admin.user.id } })).toBe(0);
});
