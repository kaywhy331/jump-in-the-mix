import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";

test("invitation-only entry fits phones and desktops in both themes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Explicit viewport and theme matrix.");
  await page.goto("/register");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("An invitation from someone you know");
  await expect(page.locator("form")).toHaveCount(0);
  await expect(page.getByText(/Each member has three invitations/)).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    }
  }
});

test("invalid invitation URLs do not open signup or expose a recipient", async ({ page, request }) => {
  const response = await request.get("/register?invite=invalid");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response.headers()["cache-control"]).toContain("no-store");
  await page.goto("/register?invite=invalid");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This invitation is unavailable");
  await expect(page.locator("form")).toHaveCount(0);
});

test.describe("invited registrations", () => {
  const created: { userEmails: string[]; inviteIds: string[] } = { userEmails: [], inviteIds: [] };

  async function invitation(recipient: { recipientEmail?: string; recipientPhone?: string }) {
    const token = randomBytes(32).toString("base64url");
    const invite = await prisma.referralAccessInvite.create({ data: { ...recipient, manualDelivery: Boolean(recipient.recipientPhone), source: "WAITLIST_MANUAL", tokenHash: createHash("sha256").update(token).digest("hex"), tokenCiphertext: "unused-browser-fixture" } });
    created.inviteIds.push(invite.id);
    return { token, invite };
  }

  test.beforeEach(async () => {
    // Registration is throttled per address of the caller; browser runs share one.
    await prisma.authRateLimit.deleteMany({ where: { scope: { in: ["auth.register.ip", "auth.register.email", "auth.verify.resend.ip", "auth.verify.resend.email"] } } });
  });

  test.afterEach(async () => {
    const users = await prisma.user.findMany({ where: { email: { in: created.userEmails } }, select: { id: true } });
    await prisma.workspace.deleteMany({ where: { ownerId: { in: users.map(user => user.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } });
    await prisma.verificationToken.deleteMany({ where: { email: { in: created.userEmails } } });
    await prisma.referralAccessInvite.deleteMany({ where: { id: { in: created.inviteIds } } });
    created.userEmails.length = 0; created.inviteIds.length = 0;
  });

  test("an email invitation fixes the address and the first screen says the link was sent", async ({ page }) => {
    const email = `invited-${randomUUID().slice(0, 8)}@example.test`;
    created.userEmails.push(email);
    const { token, invite } = await invitation({ recipientEmail: email });
    await page.goto(`/register?invite=${token}`);
    await expect(page.getByRole("heading", { name: "Create your free account" })).toBeVisible();
    const emailField = page.locator("input[name=email]");
    await expect(emailField).toHaveValue(email);
    await expect(emailField).toHaveAttribute("readonly", "");
    await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible();
    await expect(page.getByLabel("Confirm email")).toHaveCount(0);
    await page.getByLabel("Your name").fill("Invited Member");
    await page.getByLabel("Password", { exact: true }).fill("Registration test 123!");
    await Promise.all([
      page.waitForURL(/\/verify-email\/pending\?/),
      page.getByRole("button", { name: "Create free account" }).click()
    ]);
    expect(new URL(page.url()).searchParams.get("registered")).toBe("1");
    // Without a real mail provider (CI and local production builds) the send fails; the first screen
    // must still never claim a "new" link, and must say so when nothing was sent.
    const delivered = new URL(page.url()).searchParams.get("delivery") !== "failed";
    if (delivered) await expect(page.getByRole("status").filter({ hasText: `We sent a verification link to ${email}.` })).toBeVisible();
    else await expect(page.locator(".notice.error")).toContainText("The email provider could not deliver the message.");
    await expect(page.getByText("A new verification link was prepared")).toHaveCount(0);
    expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: invite.id } })).acceptedAt).not.toBeNull();
    await expect(prisma.user.findUniqueOrThrow({ where: { email } })).resolves.toMatchObject({ emailVerifiedAt: null });
    await Promise.all([
      page.waitForURL(/[?&]sent=1/),
      page.getByRole("button", { name: "Send another verification link" }).click()
    ]);
    if (new URL(page.url()).searchParams.get("delivery") !== "failed") await expect(page.getByRole("status").filter({ hasText: "A new link replaces older ones." })).toBeVisible();
    else await expect(page.locator(".notice.error")).toContainText("The email provider could not deliver the message.");
  });

  test("a text invitation asks for the email twice and keeps the invitation on a mismatch", async ({ page }) => {
    const email = `texted-${randomUUID().slice(0, 8)}@example.test`;
    created.userEmails.push(email);
    const { token, invite } = await invitation({ recipientPhone: `+1555${String(Date.now()).slice(-7)}` });
    await page.goto(`/register?invite=${token}`);
    await expect(page.locator("input[name=email]")).toHaveValue("");
    await page.getByLabel("Your name").fill("Texted Member");
    await page.locator("input[name=email]").fill(email);
    await page.getByLabel("Confirm email").fill(`typo-${email}`);
    await page.getByLabel("Password", { exact: true }).fill("Registration test 123!");
    await page.getByRole("button", { name: "Create free account" }).click();
    await expect(page.locator(".notice.error")).toContainText("The email addresses don't match.");
    expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: invite.id } })).acceptedAt).toBeNull();
    await page.getByLabel("Confirm email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Registration test 123!");
    await Promise.all([
      page.waitForURL(/\/verify-email\/pending\?/),
      page.getByRole("button", { name: "Create free account" }).click()
    ]);
    if (new URL(page.url()).searchParams.get("delivery") !== "failed") await expect(page.getByRole("status").filter({ hasText: `We sent a verification link to ${email}.` })).toBeVisible();
    else await expect(page.locator(".notice.error")).toContainText("The email provider could not deliver the message.");
    expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: invite.id } })).acceptedAt).not.toBeNull();
  });
});
