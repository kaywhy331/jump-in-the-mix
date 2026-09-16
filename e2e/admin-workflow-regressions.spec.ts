import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { expect, test } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { createSupportFixture } from "../tests/helpers/support-fixture";
import { encryptIntegrationCredentials } from "../src/lib/integration-crypto";
import { generateTotpCode, generateTotpSecret } from "../src/lib/totp";

const enabled = process.env.ADMIN_UX_E2E === "1" && process.env.AUTH_REQUIRE_ADMIN_MFA === "true" && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!enabled, "Requires disposable local admin UX fixtures and MFA.");
test.use({ actionTimeout: 15000, screenshot: "off", video: "off", trace: "off" });
const password = "Admin workflow synthetic password!";
async function fixture() {
  const support = await createSupportFixture();
  await prisma.user.update({ where: { id: support.admin.user.id }, data: { passwordHash: await bcrypt.hash(password, 4), staffMembership: { update: { role: "OWNER" } } } });
  const secret = generateTotpSecret();
  await prisma.adminMfaCredential.update({ where: { userId: support.admin.user.id }, data: { secretCiphertext: encryptIntegrationCredentials({ secret }) } });
  return { ...support, secret };
}

test("account change retains nonsecret fields through password failure and MFA, with explicit resubmission", async ({ page, context }, info) => {
  const f = await fixture();
  try {
    await context.addCookies([{ name: "jitm_session", value: f.admin.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
    await page.goto(`/admin/users/${f.customer.user.id}?returnTo=${encodeURIComponent('/admin/users?q=Private')}`);
    const reason = "Case 842: investigate the account before restoring access";
    await page.getByLabel("Reason and case reference").fill(reason);
    await page.getByLabel("Your administrator password").fill("Incorrect password");
    await page.getByRole("button", { name: "Apply account change" }).click();
    await expect(page.locator(".notice.error")).toContainText("password");
    await expect(page.getByLabel("Reason and case reference")).toHaveValue(reason);
    await expect(page.getByLabel("Your administrator password")).toHaveValue("");
    await prisma.adminMfaSession.update({ where: { sessionId: f.admin.session.id }, data: { verifiedAt: new Date(Date.now() - 11 * 60_000) } });
    await page.getByLabel("Your administrator password").fill(password);
    await page.getByRole("button", { name: "Apply account change" }).click();
    await expect(page).toHaveURL(/\/account\/admin-mfa\?verify=1/);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: f.customer.user.id } })).suspendedAt).toBeNull();
    await page.getByLabel("Verification code").fill(generateTotpCode(f.secret));
    await page.getByRole("button", { name: "Verify and continue", exact: true }).click();
    await expect(page.getByLabel("Reason and case reference")).toHaveValue(reason);
    await expect(page.getByLabel("Your administrator password")).toHaveValue("");
    await expect(page.getByRole("link", { name: "Back to results" })).toHaveAttribute("href", "/admin/users?q=Private");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: f.customer.user.id } })).suspendedAt).toBeNull();
    await page.getByLabel("Your administrator password").fill(password);
    await page.getByRole("button", { name: "Apply account change" }).click();
    await expect(page).toHaveURL(/updated=suspend/);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: f.customer.user.id } })).suspendedAt).not.toBeNull();
  } finally { await f.cleanup(); }
});

test("support reply survives triage, requires template replacement confirmation and resolves atomically", async ({ page, context }, info) => {
  const f = await fixture();
  try {
    await context.addCookies([{ name: "jitm_session", value: f.admin.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
    await page.goto(`/admin/support/${f.ticket.id}?returnTo=${encodeURIComponent('/admin/support?view=mine')}`);
    const body = "Keep this prepared response while updating the ticket priority.";
    await page.locator('textarea[name="body"]').fill(body);
    await page.getByRole("combobox", { name: "Priority", exact: true }).selectOption("URGENT");
    await page.getByRole("button", { name: "Save triage" }).click();
    await expect(page).toHaveURL(/triageSaved=1/);
    await expect(page.locator('textarea[name="body"]')).toHaveValue(body);
    await page.getByLabel("Response template").selectOption("Resolved");
    await expect(page.locator('textarea[name="body"]')).toHaveValue(body);
    await page.getByRole("button", { name: "Keep my reply" }).click();
    await page.getByRole("button", { name: "Send reply and resolve" }).click();
    await expect(page.getByText("Reply saved and ticket resolved. The email notification is queued separately.")).toBeVisible();
    await expect(page.locator('textarea[name="body"]')).toHaveValue("");
    await expect(page.getByRole("link", { name: "Support queue", exact: true })).toHaveAttribute("href", "/admin/support?view=mine");
    expect(await prisma.supportTicket.findUnique({ where: { id: f.ticket.id } })).toMatchObject({ status: "RESOLVED", priority: "URGENT" });
    expect(await prisma.supportTicketMessage.count({ where: { ticketId: f.ticket.id, body, authorType: "ADMIN" } })).toBe(1);
  } finally { await f.cleanup(); }
});

test("a different staff session cannot recover the previous operator's in-memory draft", async ({ page, context }, info) => {
  const f = await fixture();
  try {
    await context.addCookies([{ name: "jitm_session", value: f.admin.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
    await page.goto(`/admin/support/${f.ticket.id}`);
    await page.locator('textarea[name="body"]').fill("Private draft belonging to the first operator.");
    await page.route("**/api/admin/browser-context", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ status: "unavailable" }) }));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByRole("button", { name: "Retry session check" })).toBeEnabled();
    await expect(page.locator('textarea[name="body"]')).toBeHidden();
    await page.unroute("**/api/admin/browser-context");
    await page.getByRole("button", { name: "Retry session check" }).click();
    await expect(page.locator('textarea[name="body"]')).toBeVisible();
    await expect(page.locator('textarea[name="body"]')).toHaveValue("Private draft belonging to the first operator.");
    await context.addCookies([{ name: "jitm_session", value: f.colleague.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator('textarea[name="body"]')).toHaveValue("");
    expect(await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain("Private draft");
  } finally { await f.cleanup(); }
});

test("an analyst without Overview gets a permitted denial return and fully expired MFA has no return loop", async ({ page, context }, info) => {
  const f = await fixture();
  try {
    await prisma.staffMembership.update({ where: { userId: f.admin.user.id }, data: { role: "ANALYST", grants: [], denies: ["dashboard.read"] } });
    await context.addCookies([{ name: "jitm_session", value: f.admin.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/admin\/access-denied\?capability=users.read/);
    await expect(page.getByRole("link", { name: "Return to your workspace", exact: true })).toHaveAttribute("href", "/admin/reports");
    await page.getByRole("link", { name: "Return to your workspace", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
    await prisma.adminMfaSession.update({ where: { sessionId: f.admin.session.id }, data: { expiresAt: new Date(0) } });
    await page.goto("/admin/reports?view=content");
    await expect(page).toHaveURL(/\/account\/admin-mfa/);
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/admin/reports?view=content");
    await expect(page.getByRole("link", { name: "Return without verifying" })).toHaveCount(0);
  } finally { await f.cleanup(); }
});

test("library options retain a stale selection for explicit review and provide a confirmed reset", async ({ page, context }, info) => {
  const f = await fixture(), key = "mix.categories";
  const original = await prisma.platformSetting.findUnique({ where: { key } });
  try {
    await context.addCookies([{ name: "jitm_session", value: f.admin.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
    await page.goto("/admin/settings");
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Save options", exact: true }) }).first();
    await form.getByRole("checkbox").first().uncheck();
    const expected = (await form.locator('input[name="options"]').inputValue()).split("\n");
    const altered = [...expected].reverse();
    await prisma.platformSetting.upsert({ where: { key }, create: { key, category: "Mixes", label: "Mix categories", value: altered }, update: { value: altered, updatedAt: new Date(Date.now() + 1000) } });
    await form.getByRole("button", { name: "Save options", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("changed while you were editing");
    await expect(form.locator('input[name="options"]')).toHaveValue(expected.join("\n"));
    await form.getByRole("button", { name: "Load current values" }).click();
    await form.getByRole("button", { name: "I reviewed the current values; keep my selection" }).click();
    await form.getByRole("button", { name: "Save options", exact: true }).click();
    await expect(form.getByText("Library options saved.", { exact: true })).toBeVisible();
    expect((await prisma.platformSetting.findUniqueOrThrow({ where: { key } })).value).toEqual(expected);
    await form.getByRole("button", { name: "Reset to defaults…" }).click();
    await form.getByRole("button", { name: "Cancel", exact: true }).click();
    expect((await prisma.platformSetting.findUniqueOrThrow({ where: { key } })).value).toEqual(expected);
    await form.getByRole("button", { name: "Reset to defaults…" }).click();
    await form.getByRole("button", { name: "Restore defaults", exact: true }).click();
    await expect(form.getByText("Reviewed defaults restored.", { exact: true })).toBeVisible();
    expect(await prisma.platformSetting.findUnique({ where: { key } })).toBeNull();
  } finally {
    await prisma.platformSetting.deleteMany({ where: { key } });
    if (original) await prisma.platformSetting.create({ data: { ...original, value: original.value as string[] } });
    await f.cleanup();
  }
});

test("export polling pauses while hidden and stops after eight automatic checks", async ({ page, context }, info) => {
  const f = await fixture();
  try {
    await prisma.reportExport.create({ data: { actorUserId: f.admin.user.id, actorSessionId: f.admin.session.id, requestKey: randomUUID(), fromDay: new Date("2020-01-01"), throughDay: new Date("2020-01-01"), expiresAt: new Date(Date.now()+3600_000) } });
    await context.addCookies([{ name: "jitm_session", value: f.admin.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
    await page.clock.install();
    await page.goto("/admin/reports/exports");
    await expect(page.getByText(/Checking every 15 seconds while visible/)).toBeVisible();
    let refreshes = 0;
    page.on("request", request => { if (request.url().includes("/admin/reports/exports") && request.headers().rsc) refreshes++; });
    await page.evaluate(() => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }));
    await page.clock.runFor(30_000); expect(refreshes).toBe(0);
    await page.evaluate(() => Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }));
    for (let index=0; index<8; index++) {
      await Promise.all([page.waitForResponse(response => response.url().includes("/admin/reports/exports") && response.request().headers().rsc === "1"), page.clock.runFor(15_000)]);
      await expect(page.getByRole("button", { name: "Refresh status", exact: true })).toBeEnabled();
    }
    await page.clock.runFor(15_000);
    await expect(page.getByText(/Automatic checks paused/)).toBeVisible();
    expect(refreshes).toBe(8);
    await page.clock.runFor(120_000); expect(refreshes).toBe(8);
  } finally { await prisma.reportExport.deleteMany({ where: { actorUserId: f.admin.user.id } }); await f.cleanup(); }
});
