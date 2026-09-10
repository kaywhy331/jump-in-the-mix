import { applyRenderedTheme } from "./theme-fixture";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

const enabled = process.env.STAFF_E2E === "1" && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!enabled, "Requires isolated staff fixtures and a local test database.");
const password = "Local user administration test 27!";

async function fixtures() {
  const suffix = randomUUID(), passwordHash = await bcrypt.hash(password, 4);
  const actor = await prisma.user.create({ data: { email: `operator-${suffix}@example.test`, name: "Access operator", emailVerifiedAt: new Date(), passwordHash, staffMembership: { create: { role: "OPERATOR" } } } });
  const customer = await prisma.user.create({ data: { email: `member-${suffix}@example.test`, name: "Account under review", emailVerifiedAt: new Date(), passwordHash } });
  const workspace = await prisma.workspace.create({ data: { ownerId: customer.id, name: "Member connections", slug: suffix, members: { create: { userId: customer.id, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } });
  await prisma.notificationPreference.create({ data: { workspaceId: workspace.id, userId: customer.id, emailDigestEnabled: true, weeklyReportEnabled: true } });
  await prisma.automationPreference.create({ data: { workspaceId: workspace.id, enabled: true, emailEnabled: true } });
  const tokens = [];
  for (const userId of [actor.id, customer.id]) {
    const token = randomBytes(32).toString("base64url"); tokens.push(token);
    await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  }
  return { actor, customer, workspace, tokens, async cleanup() {
    await prisma.platformAuditEvent.deleteMany({ where: { OR: [{ actorUserId: actor.id }, { entityId: customer.id }] } });
    await prisma.notificationPreference.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.automationPreference.deleteMany({ where: { workspaceId: workspace.id } });
    await prisma.workspace.deleteMany({ where: { id: workspace.id } });
    await prisma.user.deleteMany({ where: { id: { in: [actor.id, customer.id] } } });
  } };
}

test("operator suspends and restores a member without restarting their sending", async ({ page, context, browser }, testInfo) => {
  const data = await fixtures();
  const customerContext = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const customerPage = await customerContext.newPage();
  try {
    await context.addCookies([{ name: "jitm_session", value: data.tokens[0], url: testInfo.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
    await customerContext.addCookies([{ name: "jitm_session", value: data.tokens[1], url: testInfo.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
    await customerPage.goto("/account");
    await expect(customerPage).toHaveURL(/\/account$/);
    await page.goto(`/admin/users?q=${encodeURIComponent(data.customer.email)}`);
    await page.getByRole("button", { name: "Manage account access…" }).click();
    await page.getByLabel("Reason for account change").fill("Case 501: review a compromised account");
    await page.getByLabel("Your administrator password").fill(password);
    await page.getByRole("button", { name: "Apply account change" }).click();
    await expect(page).toHaveURL(/updated=suspend/);
    await expect(page.getByText("Suspended", { exact: true })).toBeVisible();
    await customerPage.goto("/account");
    await expect(customerPage).toHaveURL(/\/login$/);
    expect(await prisma.session.count({ where: { userId: data.customer.id } })).toBe(0);
    expect((await prisma.automationPreference.findUniqueOrThrow({ where: { workspaceId: data.workspace.id } })).enabled).toBe(false);
    await page.getByRole("button", { name: "Manage account access…" }).click();
    await expect(page.getByLabel("Account operation")).toHaveValue("restore");
    await page.getByLabel("Reason for account change").fill("Case 501: access review is complete");
    await page.getByLabel("Your administrator password").fill(password);
    await page.getByRole("button", { name: "Apply account change" }).click();
    await expect(page).toHaveURL(/updated=restore/);
    await expect(page.getByText("Active", { exact: true })).toBeVisible();
    expect((await prisma.notificationPreference.findUniqueOrThrow({ where: { workspaceId: data.workspace.id } })).emailDigestEnabled).toBe(false);
    expect((await prisma.automationPreference.findUniqueOrThrow({ where: { workspaceId: data.workspace.id } })).enabled).toBe(false);
    expect(await prisma.platformAuditEvent.count({ where: { entityId: data.customer.id, action: { startsWith: "user.access." } } })).toBe(2);
    await customerPage.goto("/account");
    await expect(customerPage).toHaveURL(/\/login$/);
  } finally { await customerContext.close(); await data.cleanup(); }
});

test("account controls enforce live permissions and fit phone and desktop screens", async ({ page, context }, testInfo) => {
  const data = await fixtures();
  try {
    await context.addCookies([{ name: "jitm_session", value: data.tokens[0], url: testInfo.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
    await page.goto(`/admin/users?q=${encodeURIComponent(data.customer.email)}`);
    for (const colorScheme of ["light", "dark"] as const) for (const width of [320, 1440]) {
      await applyRenderedTheme(page, colorScheme, { width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.getByRole("button", { name: "Manage account access…" }).click();
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.keyboard.press("Escape");
    }
    await page.getByRole("button", { name: "Manage account access…" }).click();
    await page.getByLabel("Reason for account change").fill("Case 502: change from an old browser tab");
    await page.getByLabel("Your administrator password").fill(password);
    await prisma.staffMembership.update({ where: { userId: data.actor.id }, data: { denies: ["users.suspend"] } });
    await page.getByRole("button", { name: "Apply account change" }).click();
    await expect(page).toHaveURL(/\/admin\/access-denied$/);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: data.customer.id } })).suspendedAt).toBeNull();
    await page.goto(`/admin/users?q=${encodeURIComponent(data.customer.email)}`);
    await page.getByRole("button", { name: "Manage account access…" }).click();
    await expect(page.getByLabel("Account operation")).toHaveValue("revoke_sessions");
    await page.getByLabel("Reason for account change").fill("Case 502: end the member's old sessions");
    await page.getByLabel("Your administrator password").fill(password);
    await page.getByRole("button", { name: "Apply account change" }).click();
    await expect(page).toHaveURL(/updated=revoke_sessions/);
    expect(await prisma.session.count({ where: { userId: data.customer.id } })).toBe(0);
  } finally { await data.cleanup(); }
});
