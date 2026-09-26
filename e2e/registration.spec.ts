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
    await prisma.authOAuthState.deleteMany({ where: { inviteId: { in: created.inviteIds } } });
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

  test("a person invited by text corrects a mistyped email on the verification screen", async ({ page }) => {
    const typo = `typo-${randomUUID().slice(0, 8)}@exmaple.test`, email = `fixed-${randomUUID().slice(0, 8)}@example.test`;
    created.userEmails.push(typo, email);
    const { token, invite } = await invitation({ recipientPhone: `+1555${String(Date.now()).slice(-7)}` });
    await page.goto(`/register?invite=${token}`);
    await page.getByLabel("Your name").fill("Texted Member");
    await page.locator("input[name=email]").fill(typo);
    await page.getByLabel("Confirm email").fill(typo);
    await page.getByLabel("Password", { exact: true }).fill("Registration test 123!");
    await Promise.all([
      page.waitForURL(/\/verify-email\/pending\?/),
      page.getByRole("button", { name: "Create free account" }).click()
    ]);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: typo } });
    await page.getByText("Typed the wrong email?", { exact: true }).click();
    const change = page.locator("details.verify-email-change");
    await expect(change.getByLabel("Email you signed up with")).toHaveValue(typo);
    await page.setViewportSize({ width: 320, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await change.getByLabel("Password", { exact: true }).fill("Registration test 123!");
    await change.getByLabel("Correct email", { exact: true }).fill(email);
    await change.getByLabel("Confirm correct email", { exact: true }).fill(email);
    await Promise.all([
      page.waitForURL(/[?&]sent=1/),
      change.getByRole("button", { name: "Change email and send link" }).click()
    ]);
    expect(new URL(page.url()).searchParams.get("email")).toBe(email);
    await expect(prisma.user.findUniqueOrThrow({ where: { id: user.id } })).resolves.toMatchObject({ email, emailVerifiedAt: null });
    expect(await prisma.user.count({ where: { email: typo } })).toBe(0);
    expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: invite.id } })).acceptedUserId).toBe(user.id);
  });

  test("an invitation offers Google and Apple sign-up for the invited address; sign-in explains they are for existing accounts", async ({ page }) => {
    test.skip(!process.env.SOCIAL_AUTH_E2E, "Needs a server started with (placeholder) Google and Apple credentials.");
    const email = `social-${randomUUID().slice(0, 8)}@example.test`;
    created.userEmails.push(email);
    const { token, invite } = await invitation({ recipientEmail: email });
    await page.goto(`/register?invite=${token}`);
    for (const provider of ["Google", "Apple"]) await expect(page.getByRole("link", { name: `Continue with ${provider}`, exact: true })).toHaveAttribute("href", `/api/auth/oauth/${provider.toLowerCase()}/start?invite=${encodeURIComponent(token)}`);
    await expect(page.getByText(`Choose the Google or Apple account that uses ${email}.`)).toBeVisible();
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    }
    // Starting keeps the invitation with the sign-in request, and nothing about it leaks in a referrer.
    const start = await page.request.get(`/api/auth/oauth/google/start?invite=${encodeURIComponent(token)}`, { maxRedirects: 0 });
    expect([302, 303, 307]).toContain(start.status());
    expect(start.headers().location).toMatch(/^https:\/\/accounts\.google\.com\//);
    expect(start.headers()["cache-control"]).toContain("no-store");
    expect(start.headers()["referrer-policy"]).toBe("no-referrer");
    expect(await prisma.authOAuthState.count({ where: { inviteId: invite.id, inviteTokenHash: invite.tokenHash } })).toBe(1);
    await page.goto("/login");
    await expect(page.getByRole("link", { name: "Continue with Google", exact: true })).toBeVisible();
    await expect(page.getByText("Google and Apple sign-in are for existing accounts. To create an account, open the invitation link someone shared with you.")).toBeVisible();
  });
});

test.describe("magic sign-in links", () => {
  const created: { userIds: string[]; emails: string[] } = { userIds: [], emails: [] };

  test.afterEach(async () => {
    await prisma.workspace.deleteMany({ where: { ownerId: { in: created.userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: created.userIds } } });
    await prisma.verificationToken.deleteMany({ where: { email: { in: created.emails } } });
    created.userIds.length = 0; created.emails.length = 0;
  });

  test("opening the emailed link signs in only after Continue signing in, and only once", async ({ page }) => {
    const email = `magic-${randomUUID().slice(0, 8)}@example.test`;
    const user = await prisma.user.create({ data: { email, name: "Magic Member", emailVerifiedAt: new Date() } });
    created.userIds.push(user.id); created.emails.push(email);
    await prisma.workspace.create({ data: { ownerId: user.id, name: "Magic fixture", slug: `magic-${randomUUID()}`, members: { create: { userId: user.id } }, profile: { create: { onboardingDone: true, onboardingStep: 5 } } } });
    const token = randomBytes(32).toString("base64url");
    const link = await prisma.verificationToken.create({ data: { email, purpose: "magic_login", tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 15 * 60_000) } });

    await page.goto(`/api/auth/magic?token=${token}&next=${encodeURIComponent("/contacts")}`);
    await expect(page).toHaveURL(/\/auth\/magic\?next=%2Fcontacts$/);
    expect(page.url()).not.toContain(token);
    await expect(page.getByRole("heading", { level: 1, name: "Continue signing in" })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    // Opening the link, as a mail scanner would, spends nothing and signs nobody in.
    expect((await prisma.verificationToken.findUniqueOrThrow({ where: { id: link.id } })).usedAt).toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);

    await Promise.all([page.waitForURL(/\/contacts(\?|$)/), page.getByRole("button", { name: "Continue signing in" }).click()]);
    expect((await prisma.verificationToken.findUniqueOrThrow({ where: { id: link.id } })).usedAt).not.toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);

    // The same link again in a signed-out browser: our own, signed message.
    await page.context().clearCookies();
    await page.goto(`/api/auth/magic?token=${token}`);
    await expect(page).toHaveURL(/\/login\?error=.+&sig=/);
    await expect(page.locator(".notice.error")).toHaveText("That sign-in link is invalid or expired.");
  });

  test("a message written into the address never reaches the sign-in banner", async ({ page }) => {
    await page.goto(`/login?error=${encodeURIComponent("Your account is suspended. Call +1 800 555 0100 to verify your card.")}`);
    await expect(page.locator(".notice.error")).toHaveText("Something went wrong. Please try again.");
    await expect(page.getByText("Call +1 800", { exact: false })).toHaveCount(0);
  });
});
