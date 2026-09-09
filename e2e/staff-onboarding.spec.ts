import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";
import { decryptIntegrationCredentials } from "../src/lib/integration-crypto";
import { generateTotpCode } from "../src/lib/totp";

const enabled = process.env.STAFF_ONBOARDING_E2E === "1" && process.env.AUTH_REQUIRE_ADMIN_MFA === "true" && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!enabled, "Requires isolated local fixtures and administrator MFA enabled.");
// Setup links and MFA recovery codes must not be retained in test recordings.
test.use({ trace: "off", screenshot: "off", video: "off" });
const emails: string[] = [];
const password = "Staff onboarding browser test!";
const recipient = () => { const email = `staff-onboarding-${randomUUID()}@example.test`; emails.push(email); return email; };
async function owner() {
  const user = await prisma.user.create({ data: { email: recipient(), name: "Onboarding Owner", passwordHash: await bcrypt.hash(password, 4), emailVerifiedAt: new Date(), staffMembership: { create: { role: "OWNER" } } } });
  const token = randomBytes(32).toString("base64url");
  const session = await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  await prisma.adminMfaCredential.create({ data: { userId: user.id, enabledAt: new Date(), secretCiphertext: "test-fixture" } });
  await prisma.adminMfaSession.create({ data: { userId: user.id, sessionId: session.id, expiresAt: session.expiresAt } });
  return { user, token };
}
async function invitationUrl(email: string) {
  const invite = await prisma.staffInvitation.findFirstOrThrow({ where: { email }, include: { delivery: true } });
  const message = decryptIntegrationCredentials<{ text: string }>(invite.delivery!.messageCiphertext);
  const url = new URL(message.text.match(/https?:\/\/\S+\/staff\/accept\?token=[\w-]+/)![0]);
  return { invite, path: url.pathname + url.search, token: url.searchParams.get("token")! };
}
test.afterEach(async () => {
  const users = (await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } })).map(row => row.id);
  const invitations = (await prisma.staffInvitation.findMany({ where: { email: { in: emails } }, select: { id: true } })).map(row => row.id);
  await prisma.platformAuditEvent.deleteMany({ where: { OR: [{ actorUserId: { in: users } }, { entityId: { in: invitations } }] } });
  await prisma.staffInvitation.deleteMany({ where: { email: { in: emails } } });
  await prisma.verificationToken.deleteMany({ where: { email: { in: emails } } });
  await prisma.userPreference.deleteMany({ where: { userId: { in: users } } });
  await prisma.adminMfaSession.deleteMany({ where: { userId: { in: users } } });
  await prisma.adminMfaCredential.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  emails.length = 0;
});

test("Owner invites a teammate, recipient sets up MFA, and selected permissions govern access", async ({ page, context, browser }, info) => {
  test.setTimeout(120_000);
  const fixture = await owner(), email = recipient();
  await context.addCookies([{ name: "jitm_session", value: fixture.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/admin/team");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Send staff invitation", exact: true }) });
  await form.getByLabel("New staff email").fill(email);
  await form.getByLabel("Initial staff role").selectOption("GROWTH");
  await form.getByText("Set individual permissions before acceptance").click();
  await form.getByLabel("Deny send manual waitlist invitations", { exact: true }).check();
  await form.getByLabel("Reason for staff invitation").fill("Invite launch waitlist reviewer");
  await form.getByLabel("Your Owner password").fill(password);
  await form.getByRole("button", { name: "Send staff invitation", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Staff invitation queued");
  const q = await invitationUrl(email);
  expect(await page.content()).not.toContain(q.token);
  expect(await page.content()).not.toContain(q.invite.delivery!.messageCiphertext);
  expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  for (const colorScheme of ["light", "dark"] as const) for (const width of [320, 1440]) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" }); await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
  const recipientContext = await browser.newContext({ baseURL: info.project.use.baseURL });
  try {
    const recipientPage = await recipientContext.newPage();
    recipientPage.setDefaultTimeout(15_000);
    recipientPage.setDefaultNavigationTimeout(20_000);
    const response = await recipientPage.goto(q.path);
    expect(response!.headers()["referrer-policy"]).toBe("no-referrer");
    expect(response!.headers()["cache-control"]).toContain("no-store");
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    for (const colorScheme of ["light", "dark"] as const) for (const width of [320, 1440]) {
      await recipientPage.emulateMedia({ colorScheme, reducedMotion: "reduce" }); await recipientPage.setViewportSize({ width, height: 900 });
      expect(await recipientPage.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect((await new AxeBuilder({ page: recipientPage }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    }
    await recipientPage.getByLabel("Your name").fill("New growth teammate");
    await recipientPage.getByLabel("Invited email").fill(email);
    await recipientPage.getByLabel("Create a password").fill(password);
    await recipientPage.getByLabel("Confirm password").fill(password);
    await recipientPage.getByRole("button", { name: "Create staff account" }).click();
    await expect(recipientPage).toHaveURL(/\/account\/admin-mfa\?/);
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { staffMembership: true } });
    expect(await prisma.workspaceMember.count({ where: { userId: user.id } })).toBe(0);
    expect(user.staffMembership).toMatchObject({ role: "GROWTH", denies: ["waitlist.manage"] });
    await recipientPage.goto("/admin/waitlist");
    await expect(recipientPage.getByRole("heading", { name: "Secure administrator access" })).toBeVisible();
    const secret = await recipientPage.getByTestId("mfa-secret").textContent();
    await recipientPage.getByLabel("Current password").fill(password);
    await recipientPage.getByLabel("Authenticator code", { exact: true }).fill(generateTotpCode(secret!));
    await recipientPage.getByRole("button", { name: "Enable administrator MFA" }).click();
    await expect(recipientPage.getByRole("heading", { name: "Save your recovery codes" })).toBeVisible();
    await recipientPage.getByRole("link", { name: "Continue to Admin" }).click();
    await recipientPage.goto("/admin/waitlist");
    await expect(recipientPage.getByRole("heading", { name: "Admin · Waitlist" })).toBeVisible();
    await expect(recipientPage.getByRole("button", { name: "Send invitations to selected people" })).toHaveCount(0);
    await recipientPage.goto("/admin/team");
    await expect(recipientPage).toHaveURL(/\/admin\/access-denied$/);
    await recipientPage.goto(q.path);
    await expect(recipientPage.getByRole("button", { name: "Create staff account" })).toHaveCount(0);
  } finally { await recipientContext.close().catch(() => {}); }
});

test("Owner can cancel a pending staff invitation through Team", async ({ page, context }, info) => {
  const fixture = await owner(), email = recipient();
  await context.addCookies([{ name: "jitm_session", value: fixture.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/admin/team");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Send staff invitation", exact: true }) });
  await form.getByLabel("New staff email").fill(email);
  await form.getByLabel("Reason for staff invitation").fill("Invite temporary support reviewer");
  await form.getByLabel("Your Owner password").fill(password);
  await form.getByRole("button", { name: "Send staff invitation", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Staff invitation queued");
  const q = await invitationUrl(email);
  const panel = page.locator("article").filter({ has: page.getByRole("heading", { name: email, exact: true }) });
  await panel.getByLabel("Reason for invitation change").fill("Teammate no longer needs access");
  await panel.getByLabel("Your Owner password").fill(password);
  await panel.getByRole("button", { name: "Revoke staff invitation" }).click();
  await expect(page.getByRole("status")).toContainText("Staff invitation updated");
  expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { staffInvitationId: q.invite.id } })).status).toBe("CANCELED");
  await context.clearCookies(); await page.goto(q.path);
  await expect(page.getByRole("button", { name: "Create staff account" })).toHaveCount(0);
  expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
});
