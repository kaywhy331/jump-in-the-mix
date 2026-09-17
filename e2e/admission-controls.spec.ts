import { applyRenderedTheme } from "./theme-fixture";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";
import { openTestAdmission } from "../tests/helpers/admission-fixture";
import { getAdmissionSnapshot } from "../src/lib/admission";

const enabled = process.env.ADMISSION_E2E === "1" && process.env.AUTH_REQUIRE_ADMIN_MFA === "true" && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!enabled, "Requires isolated local admission fixtures and administrator MFA enabled.");
test.use({ trace: "off", screenshot: "off", video: "off" });
const emails: string[] = [], ids: string[] = [];
const password = "Admission browser local test!";
const email = () => { const value = `admission-browser-${randomUUID()}@example.test`; emails.push(value); return value; };
let restore: (() => Promise<void>) | undefined;
async function save(page: Page) {
  const revision = Number(await page.locator('input[name="revision"]').inputValue());
  await page.getByRole("button", { name: "Save admission controls", exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === "/admin/admission" && url.searchParams.get("saved") === String(revision + 1));
  await expect(page.locator(".notice.success")).toContainText("Admission controls saved");
}
test.beforeEach(async () => { restore = await openTestAdmission(); });
async function owner() {
  const user = await prisma.user.create({ data: { email: email(), name: "Admission Owner", passwordHash: await bcrypt.hash(password, 4), emailVerifiedAt: new Date(), staffMembership: { create: { role: "OWNER" } } } }); ids.push(user.id);
  const token = randomBytes(32).toString("base64url");
  const session = await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  await prisma.adminMfaCredential.create({ data: { userId: user.id, enabledAt: new Date(), secretCiphertext: "test-fixture" } });
  await prisma.adminMfaSession.create({ data: { userId: user.id, sessionId: session.id, expiresAt: session.expiresAt } });
  return { user, token, session };
}
test.afterEach(async () => {
  const entries = await prisma.waitlistEntry.findMany({ where: { email: { in: emails } }, select: { id: true } });
  await prisma.waitlistAudit.deleteMany({ where: { entryId: { in: entries.map(row => row.id) } } });
  await prisma.referralAccessInvite.deleteMany({ where: { recipientEmail: { in: emails } } });
  await prisma.waitlistEntry.deleteMany({ where: { email: { in: emails } } });
  await prisma.verificationToken.deleteMany({ where: { email: { in: emails } } });
  await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: { in: ids } } });
  await prisma.adminMfaSession.deleteMany({ where: { userId: { in: ids } } });
  await prisma.adminMfaCredential.deleteMany({ where: { userId: { in: ids } } });
  await prisma.userPreference.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  emails.length = 0; ids.length = 0; await restore?.();
});

test("administrator saves limits and manual batches respect them, with accessible phone and desktop controls", async ({ page, context }, info) => {
  test.setTimeout(120_000);
  const fixture = await owner();
  const baseline = await getAdmissionSnapshot();
  await context.addCookies([{ name: "jitm_session", value: fixture.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/admin/admission");
  await expect(page.getByRole("heading", { name: "Admission" })).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) for (const width of [320, 1440]) {
    await applyRenderedTheme(page, colorScheme, { width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
  await page.getByLabel("Total account and reservation limit").fill(String(baseline.committed + 2));
  await page.getByLabel("Outstanding invitation limit").fill(String(baseline.outstanding + 1));
  await page.getByLabel("Reason for admission change").fill("Start with one pending customer invitation");
  await page.getByLabel("Your administrator password").fill(password);
  await save(page);
  expect(await prisma.admissionPolicy.findUniqueOrThrow({ where: { id: "default" } })).toMatchObject({ accountCeiling: baseline.committed + 2, outstandingCeiling: baseline.outstanding + 1 });
  const first = email(), second = email();
  await prisma.waitlistEntry.createMany({ data: [first, second].map(email => ({ email, verifiedAt: new Date() })) });
  await page.goto("/admin/waitlist");
  await page.getByText("Wave schedule", { exact: true }).click();
  await expect(page.getByText("The next eligible batch will wait", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review 0 invitations" })).toBeDisabled();
  await page.getByRole("checkbox", { name: first, exact: true }).check();
  await page.getByRole("checkbox", { name: second, exact: true }).check();
  await page.getByLabel("Reason for manual invitations").fill("Try selection above pending limit");
  await expect(page.getByRole("button", { name: "Review 2 invitations" })).toBeDisabled();
  await expect(page.locator('.notice.error[role="alert"]')).toContainText("fewer people");
  expect(await prisma.referralAccessInvite.count({ where: { recipientEmail: { in: [first, second] } } })).toBe(0);
  await page.getByRole("checkbox", { name: first, exact: true }).check();
  await page.getByRole("checkbox", { name: second, exact: true }).uncheck();
  await page.getByLabel("Reason for manual invitations").fill("Select one person within the limit");
  await page.getByRole("button", { name: "Review 1 invitations" }).click();
  const blocker = await prisma.referralAccessInvite.create({ data: { recipientEmail: email(), source: "WAITLIST_MANUAL", tokenHash: randomUUID(), tokenCiphertext: "test-only" } });
  await page.getByRole("button", { name: "Confirm and queue invitations" }).click();
  await expect(page.locator(".notice.error").first()).toContainText("selected invitations were not queued");
  expect(await prisma.referralAccessInvite.count({ where: { recipientEmail: { in: [first, second] } } })).toBe(0);
  await prisma.referralAccessInvite.delete({ where: { id: blocker.id } });
  page.once("dialog", dialog => dialog.accept());
  await page.reload();
  await page.getByRole("checkbox", { name: first, exact: true }).check();
  await page.getByLabel("Reason for manual invitations").fill("Select one person within the limit");
  await page.getByRole("button", { name: "Review 1 invitations" }).click();
  await page.getByRole("button", { name: "Confirm and queue invitations" }).click();
  await expect(page.locator(".notice.success")).toContainText("1 invitations queued");
  expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { email: first } })).status).toBe("ACCESS_GRANTED");
  expect(await prisma.waitlistDelivery.count({ where: { status: "QUEUED", invite: { recipientEmail: first } } })).toBe(1);
});

test("manual controls distinguish unconfigured, paused and exhausted capacity", async ({ page, context }, info) => {
  const fixture = await owner();
  const recipient = email();
  await prisma.waitlistEntry.create({ data: { email: recipient, verifiedAt: new Date() } });
  const baseline = await getAdmissionSnapshot();
  await context.addCookies([{ name: "jitm_session", value: fixture.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  const manual = page.locator("form").filter({ has: page.getByLabel("Reason for manual invitations") });
  for (const state of [
    { accountCeiling: 0, outstandingCeiling: 0, grantsPaused: false, message: "Invitation limits are not configured" },
    { accountCeiling: baseline.committed + 2, outstandingCeiling: 0, grantsPaused: false, message: "Invitation limits are not configured" },
    { accountCeiling: baseline.committed + 2, outstandingCeiling: baseline.outstanding + 1, grantsPaused: true, message: "New customer invitations are paused" },
    { accountCeiling: baseline.committed + 1, outstandingCeiling: baseline.outstanding + 1, grantsPaused: false, message: "No spaces remain" }
  ]) {
    // Reserve the one available seat only for the exhausted-capacity case.
    const reservation = state.message === "No spaces remain" ? await prisma.referralAccessInvite.create({ data: { recipientEmail: email(), source: "WAITLIST_MANUAL", tokenHash: randomUUID(), tokenCiphertext: "test-only" } }) : null;
    const { message, ...policy } = state;
    await prisma.admissionPolicy.update({ where: { id: "default" }, data: policy });
    await page.goto("/admin/waitlist");
    await expect(page.locator(".admin-inline-status")).toContainText(message === "No spaces remain" ? "Invitations are at the current access limit" : message);
    await expect(manual.getByRole("button", { name: "Review 0 invitations" })).toBeDisabled();
    await expect(page.getByRole("checkbox", { name: recipient, exact: true })).toBeDisabled();
    await page.getByText("Wave schedule", { exact: true }).click();
    await expect(page.getByRole("link", { name: "Manage admission limits and pauses" })).toHaveAttribute("href", "/admin/admission");
    if (reservation) await prisma.referralAccessInvite.delete({ where: { id: reservation.id } });
  }
  await prisma.staffMembership.update({ where: { userId: fixture.user.id }, data: { denies: ["settings.manage"] } });
  await page.goto("/admin/waitlist");
  await expect(page.getByRole("link", { name: "Manage admission limits and pauses" })).toHaveCount(0);
});

test("emergency pause preserves a recipient link and stale or removed staff authority cannot overwrite controls", async ({ page, context, browser }, info) => {
  test.setTimeout(120_000);
  const fixture = await owner();
  await context.addCookies([{ name: "jitm_session", value: fixture.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/admin/admission");
  const revision = (await prisma.admissionPolicy.findUniqueOrThrow({ where: { id: "default" } })).revision;
  await prisma.admissionPolicy.update({ where: { id: "default" }, data: { revision: { increment: 1 } } });
  await page.getByLabel("Reason for admission change").fill("Stale browser form should not overwrite");
  await page.getByLabel("Your administrator password").fill(password);
  await page.getByRole("button", { name: "Save admission controls" }).click();
  await expect(page.locator(".notice.error")).toContainText("Admission controls changed");
  expect((await prisma.admissionPolicy.findUniqueOrThrow({ where: { id: "default" } })).revision).toBe(revision + 1);
  await page.getByText("Emergency account-creation control", { exact: true }).click();
  await page.getByLabel("Emergency: pause account creation from invitations").check();
  await page.getByLabel("Pause new waitlist requests").check();
  await page.getByLabel("Reason for admission change").fill("Emergency admission rehearsal with existing links");
  await page.getByLabel("Your administrator password").fill(password);
  await page.getByLabel("I reviewed the current saved settings").check();
  await save(page);
  const token = randomBytes(32).toString("base64url"), recipient = email();
  const invite = await prisma.referralAccessInvite.create({ data: { recipientEmail: recipient, tokenHash: createHash("sha256").update(token).digest("hex"), tokenCiphertext: "unused-browser-fixture", source: "WAITLIST_MANUAL" } });
  const recipientContext = await browser.newContext({ baseURL: info.project.use.baseURL });
  try {
    const publicPage = await recipientContext.newPage(); publicPage.setDefaultTimeout(15_000);
    await publicPage.goto(`/register?invite=${token}`);
    await expect(publicPage.getByRole("heading", { name: "Account creation is temporarily paused" })).toBeVisible();
    await expect(publicPage.getByRole("button", { name: "Create free account" })).toHaveCount(0);
    expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: invite.id } })).acceptedAt).toBeNull();
    await publicPage.goto("/waitlist");
    await expect(publicPage.getByRole("status")).toContainText("New waitlist requests are paused");
    await expect(publicPage.getByRole("button", { name: "Join the waitlist" })).toHaveCount(0);
    await page.getByLabel("Emergency: pause account creation from invitations").uncheck();
    await page.getByLabel("Reason for admission change").fill("Resume signup with the preserved invitation");
    await page.getByLabel("Your administrator password").fill(password);
    await save(page);
    await publicPage.goto(`/register?invite=${token}`);
    await expect(publicPage.getByRole("button", { name: "Create free account" })).toBeVisible();
  } finally { await recipientContext.close(); }
  await prisma.staffMembership.update({ where: { userId: fixture.user.id }, data: { denies: ["settings.manage"] } });
  const prior = await prisma.admissionPolicy.findUniqueOrThrow({ where: { id: "default" } });
  await page.getByLabel("Reason for admission change").fill("Revoked authority should not save this form");
  await page.getByLabel("Your administrator password").fill(password);
  await page.getByRole("button", { name: "Save admission controls" }).click();
  await expect(page).toHaveURL(/\/admin\/access-denied/);
  expect(await prisma.admissionPolicy.findUniqueOrThrow({ where: { id: "default" } })).toEqual(prior);
});
