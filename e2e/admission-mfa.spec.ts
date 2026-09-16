import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { openTestAdmission } from "../tests/helpers/admission-fixture";
import { encryptIntegrationCredentials } from "../src/lib/integration-crypto";
import { generateTotpCode, generateTotpSecret } from "../src/lib/totp";

const enabled = process.env.ADMISSION_E2E === "1" && process.env.AUTH_REQUIRE_ADMIN_MFA === "true" && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!enabled, "Requires isolated local fixtures and administrator MFA.");
test.use({ trace: "off", screenshot: "off", video: "off" });
const password = "Synthetic admission draft password!";
const reason = "Allow one synthetic account after review";
const users: string[] = [];
let restore: (() => Promise<void>) | undefined;

async function owner() {
  const user = await prisma.user.create({ data: { name: "Synthetic Admission Owner", email: `admission-mfa-${randomUUID()}@example.test`, passwordHash: await bcrypt.hash(password, 4), emailVerifiedAt: new Date(), staffMembership: { create: { role: "OWNER" } } } });
  users.push(user.id);
  const token = randomBytes(32).toString("base64url"), secret = generateTotpSecret();
  const session = await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  await prisma.adminMfaCredential.create({ data: { userId: user.id, enabledAt: new Date(), secretCiphertext: encryptIntegrationCredentials({ secret }) } });
  await prisma.adminMfaSession.create({ data: { sessionId: session.id, userId: user.id, verifiedAt: new Date(Date.now() - 11 * 60_000), expiresAt: session.expiresAt } });
  return { user, session, token, secret };
}
async function enter(page: Page) {
  await page.getByLabel("Total account and reservation limit").fill("1");
  await page.getByLabel("Outstanding invitation limit").fill("1");
  await page.getByLabel("Pause new member referrals").check();
  await page.getByLabel("Reason for admission change").fill(reason);
  await page.getByLabel("Your administrator password").fill(password);
}
const policy = () => prisma.admissionPolicy.findUniqueOrThrow({ where: { id: "default" } });
const saves = () => prisma.platformAuditEvent.count({ where: { actorUserId: { in: users }, action: "admission.policy.change" } });
const save = (page: Page) => page.getByRole("button", { name: "Save admission controls", exact: true }).click();
async function start(page: Page, context: BrowserContext, baseURL: string, fresh = false) {
  const fixture = await owner();
  if (fresh) await prisma.adminMfaSession.update({ where: { sessionId: fixture.session.id }, data: { verifiedAt: new Date() } });
  await context.addCookies([{ name: "jitm_session", value: fixture.token, url: baseURL, httpOnly: true, sameSite: "Strict" }]);
  await page.goto("/admin/admission");
  return fixture;
}
async function verify(page: Page, secret: string) {
  await page.getByLabel("Verification code").fill(generateTotpCode(secret));
  await page.getByRole("button", { name: "Verify and continue", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/admission\?draft=/);
}
async function expectDraft(page: Page) {
  await expect(page.getByLabel("Total account and reservation limit")).toHaveValue("1");
  await expect(page.getByLabel("Outstanding invitation limit")).toHaveValue("1");
  await expect(page.getByLabel("Pause new member referrals")).toBeChecked();
  await expect(page.getByLabel("Reason for admission change")).toHaveValue(reason);
  await expect(page.getByLabel("Your administrator password")).toHaveValue("");
  await expect(page.getByText("Your admission changes have not been saved.", { exact: false })).toBeVisible();
  await expect(page.getByText("Admission controls saved.", { exact: true })).toHaveCount(0);
}

test.beforeEach(async () => {
  restore = await openTestAdmission();
  await prisma.admissionPolicy.update({ where: { id: "default" }, data: { accountCeiling: 0, outstandingCeiling: 0 } });
});
test.afterEach(async () => {
  await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: { in: users } } });
  await prisma.adminMfaSession.deleteMany({ where: { userId: { in: users } } });
  await prisma.adminMfaCredential.deleteMany({ where: { userId: { in: users } } });
  await prisma.userPreference.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  users.length = 0;
  await restore?.();
});

test("expired MFA returns the unsaved draft for explicit confirmation", async ({ page, context }, info) => {
  const fixture = await owner();
  await context.addCookies([{ name: "jitm_session", value: fixture.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  const before = await policy();
  await page.goto("/admin/admission");
  await enter(page);
  await page.getByRole("button", { name: "Save admission controls", exact: true }).click();
  await expect(page).toHaveURL(/\/account\/admin-mfa\?verify=1/);
  expect(await policy()).toEqual(before);
  await page.getByLabel("Verification code").fill(generateTotpCode(fixture.secret));
  await page.getByRole("button", { name: "Verify and continue", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/admission/);
  expect(await policy()).toEqual(before);
  expect(await saves()).toBe(0);
  await expect(page.getByText("Admission controls saved.", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Total account and reservation limit")).toHaveValue("1");
  await expect(page.getByLabel("Outstanding invitation limit")).toHaveValue("1");
  await expect(page.getByLabel("Pause new member referrals")).toBeChecked();
  await expect(page.getByLabel("Reason for admission change")).toHaveValue(reason);
  await expect(page.getByLabel("Your administrator password")).toHaveValue("");
  await expectDraft(page);
  await page.reload();
  await expectDraft(page);
  await expect(page.getByText("New invitations need configured limits.", { exact: false })).toBeVisible();
  expect(await policy()).toEqual(before);
  await page.getByLabel("Your administrator password").fill(password);
  await save(page);
  await expect(page.getByText("Admission controls saved.", { exact: true })).toBeVisible();
  expect(await policy()).toMatchObject({ accountCeiling: 1, outstandingCeiling: 1, referralsPaused: true, revision: before.revision + 1 });
  expect(await saves()).toBe(1);
  await expect(page.getByText("New invitations need configured limits.", { exact: false })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Total account and reservation limit")).toHaveValue("1");
  expect(await saves()).toBe(1);
});

test("fresh MFA saves 1/1 unpaused; success cannot be forged in a URL and zero still warns", async ({ page, context }, info) => {
  await start(page, context, info.project.use.baseURL!, true);
  await page.goto("/admin/admission?saved=1&operation=" + randomUUID());
  await expect(page.getByText("Admission controls saved.", { exact: true })).toHaveCount(0);
  await enter(page);
  await page.getByLabel("Pause new member referrals").uncheck();
  await save(page);
  await expect(page.getByText("Admission controls saved.", { exact: true })).toBeVisible();
  expect(await policy()).toMatchObject({ accountCeiling: 1, outstandingCeiling: 1, collectionPaused: false, grantsPaused: false, referralsPaused: false, redemptionPaused: false });
  expect(await saves()).toBe(1);
  await page.getByLabel("Outstanding invitation limit").fill("0");
  await page.getByLabel("Reason for admission change").fill("Synthetic zero limit preserves warning");
  await page.getByLabel("Your administrator password").fill(password);
  await save(page);
  await expect(page.getByText("Admission controls saved.", { exact: true })).toBeVisible();
  await expect(page.getByText("New invitations need configured limits.", { exact: false })).toBeVisible();
});

test("fully expired MFA also preserves the draft before step-up", async ({ page, context }, info) => {
  const fixture = await start(page, context, info.project.use.baseURL!, true);
  await enter(page);
  await prisma.adminMfaSession.update({ where: { sessionId: fixture.session.id }, data: { verifiedAt: new Date(Date.now() - 13 * 3600_000), expiresAt: new Date(Date.now() - 1000) } });
  const before = await policy();
  await save(page);
  await expect(page).toHaveURL(/\/account\/admin-mfa\?verify=1/);
  await verify(page, fixture.secret);
  await expectDraft(page);
  expect(await policy()).toEqual(before);
  expect(await saves()).toBe(0);
});

test("failed verification, cancellation and discarding never save settings", async ({ page, context }, info) => {
  await start(page, context, info.project.use.baseURL!);
  const before = await policy();
  await enter(page); await save(page);
  await expect(page).toHaveURL(/\/account\/admin-mfa\?verify=1/);
  const returnTo = new URL(page.url()).searchParams.get("returnTo")!;
  await page.getByLabel("Verification code").fill("INVALID-RECOVERY-CODE");
  await page.getByRole("button", { name: "Verify and continue", exact: true }).click();
  await expect(page.locator(".notice.error")).toBeVisible();
  expect(await policy()).toEqual(before);
  await page.getByRole("link", { name: "Cancel verification" }).click();
  await expect(page).not.toHaveURL(/\/account\/admin-mfa/);
  expect(await saves()).toBe(0);
  await page.goto(returnTo);
  await expectDraft(page);
  await page.getByRole("button", { name: "Discard draft", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/admission$/);
  await page.goto(returnTo);
  await expect(page.getByText("This draft expired, was replaced, or belongs to another session.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Total account and reservation limit")).toHaveValue("0");
  expect(await policy()).toEqual(before);
  expect(await saves()).toBe(0);
});

test("failed password and reason validation retain the draft without a commit", async ({ page, context }, info) => {
  await start(page, context, info.project.use.baseURL!, true);
  const before = await policy();
  await enter(page);
  await page.getByLabel("Your administrator password").fill("wrong-synthetic-password");
  await save(page);
  await expect(page.locator(".notice.error")).toContainText("current administrator password");
  await expectDraft(page);
  await page.reload(); await expectDraft(page);
  await page.getByLabel("Reason for admission change").fill("short");
  await page.getByLabel("Your administrator password").fill(password);
  await page.locator('form').filter({ has: page.getByLabel("Reason for admission change") }).evaluate((form: HTMLFormElement) => { form.noValidate = true; });
  await save(page);
  await expect(page.locator(".notice.error")).toContainText("reason between 10 and 500");
  await expect(page.getByLabel("Reason for admission change")).toHaveValue("short");
  await expect(page.getByLabel("Your administrator password")).toHaveValue("");
  expect(await policy()).toEqual(before); expect(await saves()).toBe(0);
  await page.getByLabel("Reason for admission change").fill(reason);
  await page.getByLabel("Outstanding invitation limit").fill("2");
  await page.getByLabel("Your administrator password").fill(password);
  await save(page);
  await expect(page.locator(".notice.error")).toContainText("cannot exceed the total account limit");
  await expect(page.getByLabel("Outstanding invitation limit")).toHaveValue("2");
  expect(await policy()).toEqual(before); expect(await saves()).toBe(0);
  await page.getByLabel("Outstanding invitation limit").fill("1");
  await page.getByLabel("Your administrator password").fill(password);
  await save(page);
  await expect(page.getByText("Admission controls saved.", { exact: true })).toBeVisible();
  expect(await saves()).toBe(1);
});

test("concurrent settings require explicit review and a new revision check", async ({ page, context }, info) => {
  const fixture = await start(page, context, info.project.use.baseURL!);
  await enter(page); await save(page);
  await expect(page).toHaveURL(/\/account\/admin-mfa\?verify=1/);
  await prisma.admissionPolicy.update({ where: { id: "default" }, data: { accountCeiling: 3, outstandingCeiling: 2, revision: { increment: 1 } } });
  const concurrent = await policy();
  await verify(page, fixture.secret);
  await expectDraft(page);
  await expect(page.locator(".notice.error")).toContainText("Admission controls changed");
  await page.getByLabel("Your administrator password").fill(password);
  await save(page); // Required review checkbox prevents an accidental overwrite.
  expect(await policy()).toEqual(concurrent); expect(await saves()).toBe(0);
  await page.locator('form').filter({ has: page.getByLabel("Reason for admission change") }).evaluate((form: HTMLFormElement) => { form.noValidate = true; });
  await save(page); // The server also rejects a skipped review, independent of HTML validation.
  await expect(page.locator(".notice.error")).toContainText("Review the current saved settings before confirming your draft");
  expect(await policy()).toEqual(concurrent); expect(await saves()).toBe(0);
  await expectDraft(page);
  await page.getByLabel("Your administrator password").fill(password);
  await page.getByLabel("I reviewed the current saved settings").check();
  await save(page);
  await expect(page.getByText("Admission controls saved.", { exact: true })).toBeVisible();
  expect(await policy()).toMatchObject({ accountCeiling: 1, outstandingCeiling: 1, revision: concurrent.revision + 1 });
  expect(await saves()).toBe(1);
});

test("session and operation boundaries prevent another administrator restoring a draft", async ({ page, context, browser }, info) => {
  const fixture = await start(page, context, info.project.use.baseURL!);
  await enter(page); await save(page);
  await expect(page).toHaveURL(/\/account\/admin-mfa\?verify=1/);
  const returnTo = new URL(page.url()).searchParams.get("returnTo")!;
  await verify(page, fixture.secret);
  const cookie = (await context.cookies()).find(c => c.name === "jitm_admission_draft")!;
  expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe("Strict"); expect(cookie.path).toBe("/admin/admission");
  expect(page.url()).not.toContain(reason); expect(page.url()).not.toContain(password);
  await page.goto("/admin/admission?draft=" + randomUUID());
  await expect(page.getByLabel("Reason for admission change")).toHaveValue("");
  const other = await browser.newContext({ baseURL: info.project.use.baseURL });
  try {
    const otherPage = await other.newPage();
    await start(otherPage, other, info.project.use.baseURL!, true);
    await other.addCookies([cookie]);
    await otherPage.goto(returnTo);
    await expect(otherPage.getByLabel("Reason for admission change")).toHaveValue("");
    await expect(otherPage.getByLabel("Total account and reservation limit")).toHaveValue("0");
  } finally { await other.close(); }
  expect(await saves()).toBe(0);
});

test("revoked permission cannot save a restored draft", async ({ page, context }, info) => {
  const fixture = await start(page, context, info.project.use.baseURL!);
  const before = await policy();
  await enter(page); await save(page);
  await expect(page).toHaveURL(/\/account\/admin-mfa\?verify=1/);
  await verify(page, fixture.secret);
  await prisma.staffMembership.update({ where: { userId: fixture.user.id }, data: { denies: ["settings.manage"] } });
  await page.getByLabel("Your administrator password").fill(password);
  await save(page);
  await expect(page).toHaveURL(/\/admin\/access-denied/);
  expect(await policy()).toEqual(before); expect(await saves()).toBe(0);
});

test("replayed submissions audit once and cross-origin submissions are rejected", async ({ page, context }, info) => {
  await start(page, context, info.project.use.baseURL!, true);
  const before = await policy();
  await enter(page);
  const sent = page.waitForRequest(r => r.method() === "POST" && new URL(r.url()).pathname === "/admin/admission");
  await save(page);
  const request = await sent;
  await expect(page.getByText("Admission controls saved.", { exact: true })).toBeVisible();
  const headers = { "content-type": request.headers()["content-type"], "next-action": request.headers()["next-action"], origin: new URL(info.project.use.baseURL!).origin };
  const replay = await context.request.post(request.url(), { headers, data: request.postDataBuffer()!, maxRedirects: 0 });
  expect(replay.headers()["x-action-redirect"] ?? await replay.text()).toContain("Admission%20controls%20changed");
  const crossOrigin = await context.request.post(request.url(), { headers: { ...headers, origin: "https://foreign.example.test" }, data: request.postDataBuffer()!, maxRedirects: 0 });
  expect(crossOrigin.status()).toBe(403);
  expect((await policy()).revision).toBe(before.revision + 1); expect(await saves()).toBe(1);
});
