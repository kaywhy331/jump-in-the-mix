import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";
import type { StaffRole } from "../src/generated/prisma/client";

const enabled = process.env.STAFF_E2E === "1" && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!enabled, "Requires STAFF_E2E=1 and a disposable local database, with MFA disabled only for these fixtures.");
const ids: string[] = [];
const password = "StaffBrowserPassword123!";
async function fixture(role: StaffRole) {
  const id = `staff-browser-${randomUUID()}`;
  const user = await prisma.user.create({ data: { id, name: `Test ${role}`, email: `${id}@example.test`, passwordHash: await bcrypt.hash(password, 10), emailVerifiedAt: new Date(), staffMembership: { create: { role } } } });
  ids.push(id);
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({ data: { userId: id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, token };
}
test.afterEach(async () => {
  await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  ids.length = 0;
});

test("growth staff need no customer workspace and cannot open user or team data", async ({ page, context }, testInfo) => {
  const { token, user } = await fixture("GROWTH");
  await context.addCookies([{ name: "jitm_session", value: token, url: testInfo.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin · Overview" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Administration" })).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Administration" }).getByRole("link", { name: "Users" })).toHaveCount(0);
  await page.goto("/admin/waitlist");
  await expect(page.getByRole("heading", { name: "Admin · Waitlist" })).toBeVisible();
  for (const path of ["/admin/users", "/admin/team", "/admin/audit", "/admin/settings", "/admin/operations", "/admin/email", "/admin/templates"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\/access-denied$/);
  }
  expect(await prisma.platformAuditEvent.count({ where: { actorUserId: user.id, outcome: "DENIED" } })).toBeGreaterThanOrEqual(6);
  expect(await prisma.workspaceMember.count({ where: { userId: user.id } })).toBe(0);
});

test("owner edits individual staff permissions and revokes the target session", async ({ page, context }, testInfo) => {
  const owner = await fixture("OWNER"); const target = await fixture("GROWTH");
  await context.addCookies([{ name: "jitm_session", value: owner.token, url: testInfo.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/admin/team");
  const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Test GROWTH", exact: true }) });
  await panel.getByText("Change role and permissions", { exact: true }).click();
  await panel.getByLabel("Deny send manual waitlist invitations", { exact: true }).check();
  await panel.getByLabel("Reason for access change").fill("Restrict to waitlist review");
  await panel.getByLabel("Your current password").fill(password);
  await panel.getByRole("button", { name: "Save access and end sessions" }).click();
  await expect(page.getByRole("status")).toContainText("Staff access updated");
  expect(await prisma.session.count({ where: { userId: target.user.id } })).toBe(0);
  expect((await prisma.staffMembership.findUniqueOrThrow({ where: { userId: target.user.id } })).denies).toContain("waitlist.manage");
});

test("an ended support cookie can be cleared after the staff session is revoked", async ({ page, context }, testInfo) => {
  const { token, user } = await fixture("GROWTH");
  await context.addCookies([
    { name: "jitm_session", value: token, url: testInfo.project.use.baseURL!, httpOnly: true, sameSite: "Strict" },
    { name: "jitm_impersonation", value: "stale-support-token", url: testInfo.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }
  ]);
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await page.goto("/login");
  await expect(page.getByLabel("Previous support session")).toBeVisible();
  await page.getByRole("button", { name: "Clear ended support view" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Previous support session")).toHaveCount(0);
  expect((await context.cookies()).some(cookie => cookie.name === "jitm_impersonation")).toBe(false);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
});

test("invitation revocation checks current permission and cancels the durable email", async ({ page, context }, testInfo) => {
  const owner = await fixture("OWNER");
  const email = `invite-${randomUUID()}@example.test`;
  const invite = await prisma.referralAccessInvite.create({ data: { inviterUserId: owner.user.id, recipientEmail: email, tokenHash: randomUUID(), tokenCiphertext: "test-only", delivery: { create: { messageCiphertext: "test-only" } } } });
  await context.addCookies([{ name: "jitm_session", value: owner.token, url: testInfo.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/admin/access");
  const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: email, exact: true }) });
  for (const colorScheme of ["light", "dark"] as const) for (const width of [320, 1440]) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
  await panel.getByLabel("Reason for invitation change").fill("Recipient requested cancellation");
  // A previously rendered form must not retain its old privilege.
  await prisma.staffMembership.update({ where: { userId: owner.user.id }, data: { denies: ["access.revoke"] } });
  await panel.getByRole("button", { name: "Revoke invitation" }).click();
  await expect(page).toHaveURL(/\/admin\/access-denied$/);
  expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: invite.id } })).revokedAt).toBeNull();
  await prisma.staffMembership.update({ where: { userId: owner.user.id }, data: { denies: [] } });
  await page.goto("/admin/access");
  await panel.getByLabel("Reason for invitation change").fill("Recipient requested cancellation");
  await panel.getByRole("button", { name: "Revoke invitation" }).click();
  await expect(page.getByRole("status")).toContainText("invitation was revoked");
  expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: invite.id } })).revokedAt).not.toBeNull();
  expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { inviteId: invite.id } })).status).toBe("CANCELED");
  expect(await prisma.platformAuditEvent.count({ where: { entityId: invite.id, action: "access.invitation.revoke" } })).toBe(1);
});

test("operators can retry the same review item only inside its safe delivery window", async ({ page, context }, testInfo) => {
  const operator = await fixture("OPERATOR");
  const email = `retry-${randomUUID()}@example.test`;
  const invite = await prisma.referralAccessInvite.create({ data: { inviterUserId: operator.user.id, recipientEmail: email, tokenHash: randomUUID(), tokenCiphertext: "test-only", delivery: { create: { status: "REVIEW", firstAttemptAt: new Date(), attempts: 8, messageCiphertext: "unchanged-test-payload" } } } });
  await context.addCookies([{ name: "jitm_session", value: operator.token, url: testInfo.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/admin/access?review=1");
  const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: email, exact: true }) });
  await panel.getByLabel("Reason for invitation change").fill("Provider recovered; retry original message");
  await panel.getByRole("button", { name: "Retry same invitation email" }).click();
  await expect(page.getByRole("status")).toContainText("queued for another attempt");
  expect(await prisma.waitlistDelivery.findUnique({ where: { inviteId: invite.id } })).toMatchObject({ status: "QUEUED", attempts: 8, messageCiphertext: "unchanged-test-payload" });
  await prisma.waitlistDelivery.update({ where: { inviteId: invite.id }, data: { status: "REVIEW" } });
  await page.goto("/admin/access?review=1");
  await panel.getByLabel("Reason for invitation change").fill("Check expiration after page render");
  await prisma.waitlistDelivery.update({ where: { inviteId: invite.id }, data: { status: "REVIEW", firstAttemptAt: new Date(Date.now() - 25 * 3600_000) } });
  await panel.getByRole("button", { name: "Retry same invitation email" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "cannot be safely retried" })).toBeVisible();
  expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { inviteId: invite.id } })).status).toBe("REVIEW");
  await expect(panel.getByRole("button", { name: "Retry same invitation email" })).toHaveCount(0);
});

test("staff console navigation and team controls fit both themes at phone and desktop widths", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport matrix.");
  const { token } = await fixture("OWNER");
  await context.addCookies([{ name: "jitm_session", value: token, url: testInfo.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/admin/team");
  await page.getByText("Change role and permissions", { exact: true }).click();
  for (const colorScheme of ["light", "dark"] as const) for (const width of [320, 390, 1440]) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
});
