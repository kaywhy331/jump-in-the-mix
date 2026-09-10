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
  await expect(page.getByRole("status")).toContainText("Admission controls saved");
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
  await expect(page.getByRole("heading", { name: "Admin · Admission" })).toBeVisible();
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
  await page.getByRole("checkbox", { name: first, exact: true }).check();
  await page.getByRole("checkbox", { name: second, exact: true }).check();
  await page.getByLabel("Reason for manual invitations").fill("Try selection above pending limit");
  await page.getByRole("button", { name: "Send invitations to selected people" }).click();
  await expect(page.locator(".notice.error")).toContainText("selected invitations were not queued");
  expect(await prisma.referralAccessInvite.count({ where: { recipientEmail: { in: [first, second] } } })).toBe(0);
  await page.getByRole("checkbox", { name: first, exact: true }).check();
  await page.getByRole("checkbox", { name: second, exact: true }).uncheck();
  await page.getByLabel("Reason for manual invitations").fill("Select one person within the limit");
  await page.getByRole("button", { name: "Send invitations to selected people" }).click();
  await expect(page.getByRole("status")).toContainText("1 invitations queued");
  expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { email: first } })).status).toBe("ACCESS_GRANTED");
  expect(await prisma.waitlistDelivery.count({ where: { status: "QUEUED", invite: { recipientEmail: first } } })).toBe(1);
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
  await page.getByLabel("Emergency: pause account creation from invitations").check();
  await page.getByLabel("Pause new waitlist requests").check();
  await page.getByLabel("Reason for admission change").fill("Emergency admission rehearsal with existing links");
  await page.getByLabel("Your administrator password").fill(password);
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
