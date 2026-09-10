import { applyRenderedTheme } from "./theme-fixture";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";
import { preserveSystemMixFixture } from "../tests/helpers/system-mix-fixture";
import { openTestAdmission } from "../tests/helpers/admission-fixture";
import { decryptIntegrationCredentials } from "../src/lib/integration-crypto";

const enabled = process.env.SYSTEM_MIX_E2E === "1" && process.env.AUTH_REQUIRE_ADMIN_MFA === "true" && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!enabled, "Requires isolated System Mix fixtures and required administrator MFA.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 20_000 });
const users: string[] = [], emails: string[] = [];
const password = "System Mix browser fixture!";
let restoreContent: (() => Promise<unknown>) | undefined, restoreAdmission: (() => Promise<void>) | undefined;
async function identity(staff = true) {
  const user = await prisma.user.create({ data: { name: staff ? "System editor" : "Network Owner", email: `system-browser-${randomUUID()}@example.test`, emailVerifiedAt: new Date(), passwordHash: await bcrypt.hash(password, 4), ...(staff ? { staffMembership: { create: { role: "EDITOR", grants: ["mixes.publish", "access.read", "access.revoke"] } } } : {}) } }); users.push(user.id);
  const token = randomBytes(32).toString("base64url");
  const session = await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  if (staff) {
    await prisma.adminMfaCredential.create({ data: { userId: user.id, enabledAt: new Date(), secretCiphertext: "browser-fixture" } });
    await prisma.adminMfaSession.create({ data: { userId: user.id, sessionId: session.id, expiresAt: session.expiresAt } });
  }
  return { user, token };
}
async function saveDraft(page: Page, edition: string) {
  const revision = (await prisma.systemMixConfig.findUniqueOrThrow({ where: { id: "referral" } })).draftVersion + 1;
  await page.getByLabel("Invitation subject", { exact: true }).fill(`${edition}: a personal invitation from {{Sender Name}}`);
  await page.getByRole("textbox", { name: "Invitation introduction", exact: true }).fill(`Hi {{Contact Name}},\n\n${edition}: I use Jump in the Mix to keep in touch with the people in my circle. Here is one of my five invitations to a free account.\n\n{{Sender Name}}`);
  await page.getByLabel("Reason for draft change").fill(`Review the ${edition} invitation wording`);
  await page.getByRole("button", { name: "Save System Mix draft" }).click();
  await expect(page).toHaveURL(url => url.searchParams.get("saved") === String(revision));
  return revision;
}
async function release(page: Page, label: string) {
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: label, exact: true }) });
  const revision = Number(await form.locator('input[name="revision"]').inputValue());
  await form.locator('textarea[name="reason"]').fill("Review the exact saved invitation before release");
  await form.getByLabel("Your administrator password").fill(password);
  await form.getByRole("button", { name: label, exact: true }).click();
  await expect(page).toHaveURL(url => url.searchParams.get("released") === String(revision + 1));
}
test.beforeEach(async () => { restoreContent = await preserveSystemMixFixture(); restoreAdmission = await openTestAdmission(); });
test.afterEach(async () => {
  await prisma.workspace.deleteMany({ where: { ownerId: { in: users } } });
  await prisma.adminMfaSession.deleteMany({ where: { userId: { in: users } } });
  await prisma.adminMfaCredential.deleteMany({ where: { userId: { in: users } } });
  await prisma.userPreference.deleteMany({ where: { userId: { in: users } } });
  await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.verificationToken.deleteMany({ where: { email: { in: emails } } });
  await restoreContent?.(); await restoreAdmission?.(); users.length = 0; emails.length = 0;
});

test("staff publishes reviewed System Mix wording and rolls back without changing queued member invitations", async ({ page, context, browser }, info) => {
  test.setTimeout(120_000);
  const staff = await identity(), member = await identity(false);
  await context.addCookies([{ name: "jitm_session", value: staff.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  const workspace = await prisma.workspace.create({ data: { name: "Member", slug: randomUUID(), ownerId: member.user.id, members: { create: { userId: member.user.id, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } });
  const contacts = [];
  for (let i = 0; i < 2; i++) {
    const email = `system-recipient-${randomUUID()}@example.test`; emails.push(email);
    contacts.push(await prisma.contact.create({ data: { workspaceId: workspace.id, displayName: `Friend ${i}`, emails: { create: { email, normalized: email } } }, include: { emails: true } }));
  }
  const memberContext = await browser.newContext({ baseURL: info.project.use.baseURL });
  try {
    await memberContext.addCookies([{ name: "jitm_session", value: member.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
    const memberPage = await memberContext.newPage(); memberPage.setDefaultTimeout(20_000);
    await memberPage.goto("/mixes/system");
    await memberPage.getByRole("combobox", { name: "1. Choose someone in your circle" }).selectOption(JSON.stringify({ contactId: contacts[0].id, email: contacts[0].emails[0].email }));
    await expect(memberPage.locator('input[name="systemMixVersion"]')).toHaveValue("1");
    await page.goto("/admin/system-mix"); await saveDraft(page, "Second edition");
    const preview = page.locator("section").filter({ has: page.getByRole("heading", { name: "Saved draft preview · version 2", exact: true }) });
    await preview.getByLabel("Preview data").selectOption("long"); await expect(preview).toContainText("Alexandria Catherine");
    await preview.getByLabel("Preview data").selectOption("blank"); await expect(preview).toContainText("Hi there,");
    for (const colorScheme of ["light", "dark"] as const) for (const width of [320, 1440]) {
      await applyRenderedTheme(page, colorScheme, { width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    }
    await release(page, "Publish version 2");
    await memberPage.getByRole("button", { name: "Send personal invitation" }).click();
    await expect(memberPage.locator(".notice.error")).toContainText("preview changed");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.user.id } })).referralInvitesIssued).toBe(0);
    await expect(memberPage.locator('input[name="systemMixVersion"]')).toHaveValue("2");
    await memberPage.getByRole("combobox", { name: "1. Choose someone in your circle" }).selectOption(JSON.stringify({ contactId: contacts[0].id, email: contacts[0].emails[0].email }));
    await expect(memberPage.locator(".speech-bubble")).toContainText("Second edition: a personal invitation from Network Owner");
    await memberPage.getByRole("button", { name: "Send personal invitation" }).click(); await expect(memberPage).toHaveURL(/queued=1$/);
    const invitation = await prisma.referralAccessInvite.findUniqueOrThrow({ where: { inviterUserId_contactId: { inviterUserId: member.user.id, contactId: contacts[0].id } }, include: { delivery: true } });
    expect(invitation.systemMixVersion).toBe(2); expect(invitation.delivery?.status).toBe("QUEUED");
    expect(decryptIntegrationCredentials<{ subject: string }>(invitation.delivery!.messageCiphertext).subject).toBe("Second edition: a personal invitation from Network Owner");
    await expect(memberPage.locator("main")).not.toContainText("/register?invite=");
    await page.goto("/admin/access?systemMixVersion=2");
    await expect(page.getByRole("heading", { name: contacts[0].emails[0].email, exact: true })).toBeVisible();
    await expect(page.getByText("System Mix version 2", { exact: true })).toBeVisible();
    await page.goto("/admin/access?systemMixVersion=3");
    await expect(page.getByText("No invitations match these filters.")).toBeVisible();
    await page.goto("/admin/system-mix");
    await saveDraft(page, "Third edition"); await release(page, "Publish version 3");
    await page.locator("summary").filter({ hasText: /^Version 1 / }).click(); await release(page, "Roll back to version 1");
    expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { inviteId: invitation.id } })).messageCiphertext).toBe(invitation.delivery!.messageCiphertext);
    await memberPage.goto("/mixes/system");
    await memberPage.getByRole("combobox", { name: "1. Choose someone in your circle" }).selectOption(JSON.stringify({ contactId: contacts[1].id, email: contacts[1].emails[0].email }));
    await memberPage.getByRole("button", { name: "Send personal invitation" }).click(); await expect(memberPage).toHaveURL(/queued=1$/);
    expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { inviterUserId_contactId: { inviterUserId: member.user.id, contactId: contacts[1].id } } })).systemMixVersion).toBe(1);
    await page.goto("/admin/access?systemMixVersion=2");
    await page.getByLabel("Reason for invitation change").fill("Withdraw this older prepared invitation after review");
    await page.getByRole("button", { name: "Revoke invitation", exact: true }).click();
    await expect(page).toHaveURL(url => url.searchParams.get("done") === "revoke" && url.searchParams.get("systemMixVersion") === "2");
    expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { inviteId: invitation.id } })).status).toBe("CANCELED");
    expect(await prisma.referralAccessInvite.count({ where: { inviterUserId: member.user.id, revokedAt: null, systemMixVersion: 1 } })).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.user.id } })).referralInvitesIssued).toBe(2);
  } finally { await memberContext.close(); }
});

test("stale draft forms and removed publication permissions are rejected", async ({ page, context }, info) => {
  const staff = await identity(); await context.addCookies([{ name: "jitm_session", value: staff.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/admin/system-mix"); await saveDraft(page, "Review edition");
  await prisma.systemMixConfig.update({ where: { id: "referral" }, data: { controlRevision: { increment: 1 } } });
  await page.getByLabel("Reason for draft change").fill("Try a save from an older browser form");
  await page.getByRole("button", { name: "Save System Mix draft" }).click(); await expect(page.locator(".notice.error")).toContainText("changed");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Publish version 2", exact: true }) });
  await form.locator('textarea[name="reason"]').fill("Attempt publication after permission removal");
  await form.getByLabel("Your administrator password").fill(password);
  await prisma.staffMembership.update({ where: { userId: staff.user.id }, data: { grants: [] } });
  await form.getByRole("button", { name: "Publish version 2", exact: true }).click(); await expect(page).toHaveURL(/\/admin\/access-denied$/);
  await page.goto("/admin/system-mix"); await expect(page.getByRole("button", { name: "Publish version 2", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save System Mix draft" })).toBeVisible();
  expect((await prisma.systemMixConfig.findUniqueOrThrow({ where: { id: "referral" } })).publishedVersion).toBe(1);
});
