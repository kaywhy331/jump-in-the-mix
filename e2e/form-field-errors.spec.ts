import { createHash, randomUUID } from "node:crypto";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { UNCONFIRMED_SAVE } from "../src/lib/unconfirmed-save";
import { axeInPage } from "./axe-in-page";

// One way to validate (JITM-08 §2.37): an empty or invalid submit sends nothing, the fix shows beside the field,
// the field is marked and linked to it, and focus moves to the first field to fix. The server still checks.
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off" });

const EMAIL_TYPE = "Check this email address. It needs an @ and a domain, like name@example.com.";

/** Every form submission the page sends from now on (a server action, or a plain POST navigation); a refused submit adds none. */
function posts(page: Page) {
  const sent: string[] = [];
  page.on("request", request => { if (request.method() === "POST" && (request.headers()["next-action"] || request.isNavigationRequest())) sent.push(request.url()); });
  return sent;
}

/** The field is focused, marked invalid, and described by a visible message just below it that reads `text`. */
async function expectFieldError(field: Locator, text: string) {
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  const form = field.locator("xpath=ancestor::form[1]");
  const message = form.locator(".inline-field-error").filter({ hasText: text });
  await expect(message).toHaveCount(1);
  await expect(message).toBeVisible();
  const id = await message.getAttribute("id");
  expect(id).toBeTruthy();
  expect((await field.getAttribute("aria-describedby"))?.split(/\s+/)).toContain(id);
  await expect(field).toHaveAccessibleDescription(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  // Beside the field: just below it. Both boxes are read at the same moment, as focusing may still be scrolling.
  const { fieldBox, messageBox } = await field.evaluate((element, messageId) => ({ fieldBox: element.getBoundingClientRect().toJSON() as DOMRect, messageBox: document.getElementById(messageId!)!.getBoundingClientRect().toJSON() as DOMRect }), id);
  expect(messageBox.top).toBeGreaterThanOrEqual(fieldBox.bottom - 1);
  expect(messageBox.top - fieldBox.bottom).toBeLessThanOrEqual(fieldBox.height + 24);
  expect(await form.evaluate((element: HTMLFormElement) => element.noValidate)).toBe(true);
}

/** The field's own message is gone and the field is no longer marked; other fields may still need fixing. */
async function expectFixed(field: Locator) {
  await expect(field).not.toHaveAttribute("aria-invalid", "true");
  const messages = field.locator("xpath=ancestor::form[1]").locator(".inline-field-error");
  const ids = await messages.evaluateAll(elements => elements.map(element => element.id));
  expect(((await field.getAttribute("aria-describedby")) ?? "").split(/\s+/).filter(id => ids.includes(id))).toEqual([]);
}

test.describe("public forms", () => {
  test("forgot password: an empty or malformed email is fixed beside the field", async ({ page }) => {
    const sent = posts(page);
    await page.goto("/forgot-password");
    const email = page.getByLabel("Email", { exact: true });
    test.skip(!(await email.count()), "Password-reset email is unavailable on this server.");
    const send = page.getByRole("button", { name: "Send reset link", exact: true });
    await send.click();
    await expectFieldError(email, "Enter your email address.");
    await email.fill("not-an-email");
    await send.click();
    await expectFieldError(email, EMAIL_TYPE);
    expect(sent).toEqual([]);
    await email.fill("owner@example.test");
    await expectFixed(email);
  });

  test("reset password: missing and short passwords are fixed beside each field", async ({ page }) => {
    const sent = posts(page);
    await page.goto(`/reset-password?token=${"a".repeat(43)}`);
    const password = page.getByLabel("New password", { exact: true }), confirm = page.getByLabel("Confirm new password", { exact: true });
    const reset = page.getByRole("button", { name: "Reset password", exact: true });
    await reset.click();
    await expectFieldError(password, "Enter a new password.");
    await expect(confirm).toHaveAttribute("aria-invalid", "true");
    await password.fill("short");
    await reset.click();
    await expectFieldError(password, "Use a password with at least 12 characters.");
    await password.fill("a-long-enough-password");
    await expectFixed(password);
    await reset.click();
    await expectFieldError(confirm, "Enter the new password again.");
    expect(sent).toEqual([]);
    expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  });

  test("verify email: both forms check before sending, and a closed disclosure opens on its error", async ({ page }) => {
    const sent = posts(page);
    await page.goto("/verify-email/pending");
    const email = page.locator("#email");
    await page.getByRole("button", { name: "Send another verification link", exact: true }).click();
    await expectFieldError(email, "Enter your email address.");
    const change = page.locator("details.verify-email-change");
    await change.locator("summary").click();
    await page.getByLabel("Correct email", { exact: true }).fill("not-an-email");
    await change.locator("summary").click();
    await expect(change).not.toHaveAttribute("open", "");
    // Sent from the keyboard while the disclosure is closed: it opens on the first field to fix.
    await change.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
    await expect(change).toHaveAttribute("open", "");
    await expectFieldError(page.getByLabel("Email you signed up with", { exact: true }), "Enter the email you signed up with.");
    await expect(page.getByLabel("Correct email", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(change.locator(".inline-field-error").filter({ hasText: EMAIL_TYPE })).toBeVisible();
    expect(sent).toEqual([]);
  });

  test("waitlist: a malformed email sent with Enter is fixed beside the field", async ({ page }) => {
    const sent = posts(page);
    await page.goto("/waitlist");
    const email = page.getByLabel("Email address", { exact: true });
    await email.fill("not-an-email");
    await email.press("Enter");
    await expectFieldError(email, EMAIL_TYPE);
    expect(sent).toEqual([]);
    await email.fill("owner@example.test");
    await expectFixed(email);
  });

  test("leave the waitlist: an empty email is fixed beside the field", async ({ page }) => {
    const sent = posts(page);
    await page.goto("/waitlist/leave");
    const email = page.getByLabel("Email", { exact: true });
    await page.getByRole("button", { name: "Email me a confirmation link", exact: true }).click();
    await expectFieldError(email, "Enter your email address.");
    expect(sent).toEqual([]);
  });
});

test.describe("signed-in forms", () => {
  let userId: string, workspaceId: string;
  const token = randomUUID();
  test.beforeAll(async () => {
    const suffix = randomUUID();
    userId = (await prisma.user.create({ data: { email: `field-errors-${suffix}@example.test`, name: "Field errors fixture", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
    workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: suffix, name: "Field errors fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
    await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
    await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  });
  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
  });
  test.afterAll(async () => {
    if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  });
  const ready = (page: Page) => expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");

  test("Add contact checks for a name, company, email or phone, and the email format, before sending", async ({ page }) => {
    const sent = posts(page);
    await page.goto("/contacts/new"); await ready(page);
    const firstName = page.getByLabel("First name", { exact: true }), phone = page.getByLabel("Phone", { exact: true }), email = page.locator("#quick-email-0");
    const save = page.getByRole("button", { name: "Save contact", exact: true });
    await save.click();
    await expectFieldError(firstName, "Add a name, company, email, or phone number.");
    await expect(page.locator("#contact-save-error")).toHaveCount(0);
    expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    // A phone alone satisfies the rule, so the message goes as soon as one is typed.
    await phone.fill("(555) 555-0123");
    await expectFixed(firstName);
    await phone.fill("");
    await email.fill("not-an-email");
    await save.click();
    await expectFieldError(email, EMAIL_TYPE);
    expect(sent).toEqual([]);
    // A valid entry is sent exactly as before.
    await email.fill(`field-errors-${randomUUID()}@example.test`);
    await firstName.fill("Inline Fixture");
    await Promise.all([page.waitForURL(/\/contacts\/[^/?]+\?created=1/), save.click()]);
    expect(sent.length).toBeGreaterThan(0);
    expect(await prisma.contact.count({ where: { workspaceId, firstName: "Inline Fixture" } })).toBe(1);
  });

  test("Add contact's failed-save banner says that the entries are kept once", async ({ page }) => {
    await page.goto("/contacts/new"); await ready(page);
    await page.getByLabel("First name", { exact: true }).fill("Offline Fixture");
    await page.route("**/contacts/new**", route => route.request().method() === "POST" ? route.abort("failed") : route.continue());
    await page.getByRole("button", { name: "Save contact", exact: true }).click();
    const banner = page.locator("#contact-save-error");
    await expect(banner).toBeFocused();
    await expect(banner).toHaveText(UNCONFIRMED_SAVE);
    expect((await banner.innerText()).match(/entries are/gi)).toHaveLength(1);
    await expect(page.getByLabel("First name", { exact: true })).toHaveValue("Offline Fixture");
    expect(await prisma.contact.count({ where: { workspaceId, firstName: "Offline Fixture" } })).toBe(0);
  });

  test("Calendar's event form says what to fix beside the title, the contact search and the end time", async ({ page }) => {
    const sent = posts(page);
    await page.goto("/calendar?new=1&date=2026-10-15"); await ready(page);
    const form = page.locator(".calendar-entry-form");
    const title = form.getByRole("textbox", { name: "Title", exact: true });
    const save = form.getByRole("button", { name: "Save event", exact: true });
    await save.click();
    await expectFieldError(title, "Give this event a title.");
    expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    await title.fill("Inline error fixture");
    await expectFixed(title);
    // A search left unchosen keeps the page's own wording, now beside the field.
    const search = form.getByRole("combobox", { name: "Contact (optional)" });
    await search.fill("Nobody by this name");
    await save.click();
    await expectFieldError(search, "Choose a saved contact, create a new contact, or clear the search.");
    await search.fill("");
    await expect(search).not.toHaveAttribute("aria-invalid", "true");
    await search.press("Escape");
    await form.getByRole("button", { name: "Custom end", exact: true }).click();
    const ends = form.getByLabel("Ends", { exact: true });
    await ends.fill("");
    await save.click();
    await expectFieldError(ends, "Choose when the event ends.");
    expect(sent).toEqual([]);
    expect(await prisma.calendarEntry.count({ where: { workspaceId } })).toBe(0);
  });
});
