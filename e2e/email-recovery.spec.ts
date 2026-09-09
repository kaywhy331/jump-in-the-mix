import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";
import { createEmailReviewFixture } from "../tests/helpers/email-review-fixture";
import { clearRateLimit } from "../src/lib/rate-limit";

const enabled = process.env.EMAIL_RECOVERY_E2E === "1" && process.env.AUTH_REQUIRE_ADMIN_MFA === "true" && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!enabled, "Requires isolated email-review fixtures and administrator MFA.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 20_000 });
let f: Awaited<ReturnType<typeof createEmailReviewFixture>>;
test.beforeEach(async ({ context }, info) => {
  f = await createEmailReviewFixture();
  await context.addCookies([{ name: "jitm_session", value: f.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
});
test.afterEach(async () => {
  if (!f) return;
  await clearRateLimit("admin.email-clearance", [f.user.id]); await clearRateLimit("admin.email-receipt", [f.user.id]);
  await clearRateLimit("admin.email-repeat", [f.user.id]);
  await f.cleanup();
});
async function layout(page: import("@playwright/test").Page) {
  for (const width of [320, 1440]) for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 900 }); await page.evaluate(value => document.documentElement.setAttribute("data-theme", value), theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width} ${theme}`).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
}
async function reviewForm(page: import("@playwright/test").Page) {
  await page.getByRole("textbox", { name: "Reason for clearance", exact: true }).fill("The recipient requested email again after the delivery problem was resolved.");
  await page.getByRole("textbox", { name: /^Provider review reference/ }).fill("Provider review OP-100");
  await page.getByRole("textbox", { name: /^Recipient request reference/ }).fill("Support case OP-101");
  await page.getByRole("checkbox", { name: /I reviewed the cause/ }).check();
  await page.getByRole("checkbox", { name: /The recipient explicitly requested/ }).check();
  await page.getByLabel("Current administrator password", { exact: true }).fill(f.password);
}

test("review clears provider blocks while preserving recipient opt-out and all prior invitation state", async ({ page }) => {
  const { invite, delivery } = await f.invitation();
  await prisma.referralAccessInvite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
  await prisma.waitlistDelivery.update({ where: { id: delivery.id }, data: { status: "CANCELED" } });
  await prisma.waitlistEntry.create({ data: { email: f.email, status: "SUPPRESSED", verifiedAt: new Date() } });
  await prisma.emailSuppression.createMany({ data: ["HARD_BOUNCE", "COMPLAINT", "INVITATION_OPTOUT"].map(reason => ({ email: f.email, reason: reason as "HARD_BOUNCE" | "COMPLAINT" | "INVITATION_OPTOUT" })) });
  await page.goto("/admin/email/suppressions"); await page.getByRole("searchbox", { name: "Recipient email" }).fill(f.email); await page.getByRole("button", { name: "Search recipients" }).click();
  await expect(page.getByRole("heading", { name: f.email, exact: true })).toBeVisible(); await layout(page);
  await page.getByRole("link", { name: "Review recipient", exact: true }).click(); await expect(page.getByRole("heading", { name: "Clear 2 provider blocks" })).toBeVisible(); await layout(page);
  await reviewForm(page); await page.getByRole("button", { name: "Clear provider blocks locally" }).click();
  await expect(page).toHaveURL(/cleared=1$/); await expect(page.getByText("Provider blocks were cleared locally.", { exact: false })).toBeVisible();
  await expect(page.getByText("The recipient’s invitation opt-out remains in place.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear provider blocks locally" })).toHaveCount(0);
  expect(await prisma.emailSuppression.count({ where: { email: f.email, clearedAt: { not: null } } })).toBe(2);
  expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status).toBe("CANCELED");
  expect((await prisma.waitlistEntry.findUniqueOrThrow({ where: { email: f.email } })).status).toBe("SUPPRESSED");
});

test("a changed suppression invalidates the rendered review and removal of permission prevents saving", async ({ page }) => {
  const suppression = await prisma.emailSuppression.create({ data: { email: f.email, reason: "HARD_BOUNCE" } });
  await page.goto(`/admin/email/suppressions/${suppression.id}`); await reviewForm(page);
  await prisma.emailSuppression.update({ where: { id: suppression.id }, data: { revision: { increment: 1 } } });
  await page.getByRole("button", { name: "Clear provider blocks locally" }).click(); await expect(page.locator(".notice.error")).toContainText("suppression changed");
  await reviewForm(page); await prisma.staffMembership.update({ where: { userId: f.user.id }, data: { denies: ["email.manage"] } });
  await page.getByRole("button", { name: "Clear provider blocks locally" }).click(); await expect(page).toHaveURL(/access-denied/);
  expect((await prisma.emailSuppression.findUniqueOrThrow({ where: { id: suppression.id } })).clearedAt).toBeNull();
});

test("recorded acceptance recovers through the actual action while a missing receipt remains under review", async ({ page }) => {
  const known = await f.invitation(), unknown = await f.invitation(false);
  await page.goto("/admin/email/recovery"); await expect(page.getByRole("heading", { name: "Email recovery", exact: true })).toBeVisible();
  expect(await page.content()).not.toMatch(/SECRET_INVITATION_SUBJECT|SECRET_ACCESS_URL_DO_NOT_EXPOSE|test-only-email-review/); await layout(page);
  const card = page.locator("section.card").filter({ hasText: `Delivery record: ${known.delivery.id}` });
  await card.getByRole("textbox", { name: "Recovery reason", exact: true }).fill("Restore the locally recorded provider acceptance without sending again.");
  await card.getByRole("button", { name: "Recover recorded acceptance" }).click(); await expect(page).toHaveURL(/recovered=1$/);
  await expect(page.getByText("The matching provider acceptance was recovered.", { exact: false })).toBeVisible();
  expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: known.delivery.id } })).status).toBe("SENT");
  expect(await prisma.emailSendAttempt.count({ where: { messageId: known.record.id } })).toBe(0);
  const other = page.locator("section.card").filter({ hasText: `Delivery record: ${unknown.delivery.id}` });
  await other.getByRole("textbox", { name: "Recovery reason", exact: true }).fill("Check whether this uncertain send has a recorded acceptance.");
  await other.getByRole("button", { name: "Recover recorded acceptance" }).click(); await expect(page.locator(".notice.error")).toContainText("No matching local acceptance");
  expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: unknown.delivery.id } })).status).toBe("REVIEW");
});

test("current MFA and invitation-type permission are enforced independently", async ({ page }) => {
  await f.invitation(); await prisma.staffMembership.update({ where: { userId: f.user.id }, data: { denies: ["access.read"] } });
  await page.goto("/admin/email/recovery"); expect(await page.content()).not.toContain(f.email);
  await prisma.adminMfaSession.deleteMany({ where: { userId: f.user.id } });
  await page.goto("/admin/email/suppressions"); await expect(page).toHaveURL(/\/account\/admin-mfa/);
});

test("reviewed resend uses the existing invitation and preserves history through the actual action", async ({ page }) => {
  const item = await f.invitation(false);
  await page.goto("/admin/email/recovery");
  const card = page.locator("section.card").filter({ hasText: `Delivery record: ${item.delivery.id}` });
  await card.getByText("Review sending this invitation again", { exact: true }).click();
  await card.getByRole("textbox", { name: "Reason for another email", exact: true }).fill("Recipient requested another copy after we checked the provider record.");
  await card.getByRole("textbox", { name: "Provider investigation reference", exact: true }).fill("Provider OP-202");
  await card.getByRole("textbox", { name: "Recipient request reference", exact: true }).fill("Support OP-203");
  await card.getByRole("checkbox", { name: /I investigated/ }).check();
  await card.getByRole("checkbox", { name: /The recipient requested/ }).check();
  await card.getByRole("checkbox", { name: /I understand/ }).check();
  await card.getByLabel("Current administrator password", { exact: true }).fill(f.password);
  await layout(page);
  expect(await page.content()).not.toMatch(/SECRET_INVITATION_SUBJECT|SECRET_ACCESS_URL_DO_NOT_EXPOSE/);
  await card.getByRole("button", { name: "Queue the same invitation again" }).click();
  await expect(page).toHaveURL(/queued=1$/);
  await expect(page.locator(".notice.success")).toContainText("same invitation is queued");
  const queued = await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: item.delivery.id } });
  expect(queued).toMatchObject({ generation: 2, status: "QUEUED", attempts: 0, firstAttemptAt: null });
  expect(await prisma.referralAccessInvite.count({ where: { recipientEmail: f.email } })).toBe(1);
  expect(await prisma.emailSendAttempt.count({ where: { messageId: item.record.id } })).toBe(0);
  expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: item.invite.id } })).tokenHash).toBe(item.invite.tokenHash);
  // A late receipt is displayed from the original ledger, without exposing content.
  await prisma.emailMessage.update({ where: { id: item.record.id }, data: { providerId: "late-provider-receipt", acceptedAt: new Date() } });
  await prisma.waitlistDelivery.update({ where: { id: queued.id }, data: { status: "REVIEW" } });
  await page.goto(`/admin/email/recovery?q=${encodeURIComponent(f.email)}`);
  await page.getByText("Previous deliveries · latest five", { exact: true }).click();
  await expect(page.getByText(/Delivery 1: Provider acceptance recorded/)).toContainText("late-provider-receipt");
});

test("provider form rejects an arbitrary URL locally and resend requires renewed MFA", async ({ page }) => {
  const item = await f.invitation(false);
  await page.goto("/admin/email/recovery");
  const card = page.locator("section.card").filter({ hasText: `Delivery record: ${item.delivery.id}` });
  await card.getByText("Check provider record", { exact: true }).click();
  // Exactly 36 characters passes HTML length checks; the server must still reject it.
  await card.getByRole("textbox", { name: "Provider email record ID", exact: true }).fill("https://attacker.test/".padEnd(36, "x"));
  await card.getByRole("textbox", { name: "Provider check reason", exact: true }).fill("Check that only opaque provider identifiers are accepted.");
  await card.getByRole("button", { name: "Verify and recover provider receipt" }).click();
  await expect(page.locator(".notice.error")).toContainText("not a URL");
  await card.getByText("Review sending this invitation again", { exact: true }).click();
  await card.getByRole("textbox", { name: "Reason for another email", exact: true }).fill("Recipient requested a repeat after provider review.");
  await card.getByRole("textbox", { name: "Provider investigation reference", exact: true }).fill("Provider OP-204");
  await card.getByRole("textbox", { name: "Recipient request reference", exact: true }).fill("Support OP-205");
  await card.getByRole("checkbox", { name: /I investigated/ }).check(); await card.getByRole("checkbox", { name: /The recipient requested/ }).check(); await card.getByRole("checkbox", { name: /I understand/ }).check();
  await card.getByLabel("Current administrator password", { exact: true }).fill(f.password);
  await prisma.adminMfaSession.update({ where: { sessionId: f.session.id }, data: { verifiedAt: new Date(Date.now() - 11 * 60_000) } });
  await card.getByRole("button", { name: "Queue the same invitation again" }).click();
  await expect(page).toHaveURL(/\/account\/admin-mfa\?verify=1/);
  expect((await prisma.waitlistDelivery.findUniqueOrThrow({ where: { id: item.delivery.id } })).generation).toBe(1);
});
