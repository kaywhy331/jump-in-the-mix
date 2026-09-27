import { createHash, randomBytes, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.setTimeout(120_000);
const users: string[] = [];
async function account(page: Page, onboardingDone = false) {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { name: "Onboarding Owner", email: `onboarding-${suffix}@example.test`, emailVerifiedAt: new Date() } }); users.push(user.id);
  const workspace = await prisma.workspace.create({ data: { name: "Onboarding fixture", slug: suffix, ownerId: user.id, members: { create: { userId: user.id } }, profile: { create: { onboardingDone } } } });
  await prisma.userPreference.create({ data: { userId: user.id, timezone: "UTC" } });
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  await page.context().addCookies([{ name: "jitm_session", value: token, url: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000", httpOnly: true, sameSite: "Strict" }]);
  await page.request.get("/api/auth/browser-context");
  return { user, workspace };
}
test.beforeAll(async () => {
  await prisma.dateType.upsert({ where: { scopeKey_slug: { scopeKey: "system", slug: "follow-up" } }, create: { scopeKey: "system", slug: "follow-up", name: "Follow-up", isSystem: true }, update: {} });
});
test.afterEach(async () => {
  await prisma.contactActivity.deleteMany({ where: { actorUserId: { in: users } } });
  await prisma.workspace.deleteMany({ where: { ownerId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } }); users.length = 0;
});

test("onboarding supports multiple purposes, a single starting-point dropdown, and imported contacts", async ({ page }) => {
  const { workspace } = await account(page);
  await page.goto("/onboarding");
  await page.getByRole("radio", { name: /Choose individual mixes/ }).check();
  await page.getByRole("button", { name: "Start with one person and one follow-up instead" }).click();
  await page.getByRole("checkbox", { name: /Personal connections/ }).check();
  await page.getByRole("checkbox", { name: /Networking and business development/ }).check();
  await expect(page.getByRole("checkbox", { name: /^Business/ })).toBeChecked();
  await expect(page.getByText("Choose a different follow-up")).toHaveCount(0);
  await page.getByLabel("What do you want to do?").selectOption("Check in with a friend");
  await expect(page.getByLabel("Email recommended")).toBeVisible();
  await expect(page.getByLabel("Phone recommended")).toBeVisible();
  await expect(page.getByRole("link", { name: "Import contacts from a file" })).toHaveAttribute("href", "/contacts/import?onboarding=1");
  await page.getByText("Optional business details and signature", { exact: true }).click();
  await page.getByRole("textbox", { name: "Business name (optional)", exact: true }).fill("Saved Business");
  const contact = await prisma.contact.create({ data: { workspaceId: workspace.id, displayName: "Imported Friend", firstName: "Imported", source: "CSV", emails: { create: { email: "friend@example.test", normalized: "friend@example.test", isPrimary: true } } } });
  await page.getByRole("button", { name: "Refresh imported contacts" }).click();
  await page.getByLabel("Choose a saved person").selectOption(contact.id);
  await expect(page.getByRole("textbox", { name: "Business name (optional)", exact: true })).toHaveValue("Saved Business");
  await expect(page.getByLabel("What do you want to do?")).toHaveValue("Check in with a friend");
  const accessibility = await axeInPage(page).include(".onboarding-card").analyze();
  expect(accessibility.violations.filter(item => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  await page.screenshot({ path: `.artifacts/onboarding-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole("checkbox", { name: /I reviewed this plan/ }).check();
  await page.getByRole("button", { name: "Prepare my first follow-up" }).click();
  await expect(page).toHaveURL(/\/jumps\?.*welcome=1/);
  expect((await prisma.workspaceProfile.findUniqueOrThrow({ where: { workspaceId: workspace.id } })).useCases).toEqual(["business", "personal", "networking"]);
  expect(await prisma.contact.count({ where: { workspaceId: workspace.id } })).toBe(1);
  expect(await prisma.jump.count({ where: { workspaceId: workspace.id, contactId: contact.id } })).toBeGreaterThan(0);
});

test("three mixed-channel invitations become Today reminders with single-use links and no queued emails", async ({ page }) => {
  const { user, workspace } = await account(page, true);
  await page.goto("/mixes/system");
  await expect(page.getByRole("heading", { name: "3 of 3 invitations remaining" })).toBeVisible();
  const suffix = randomUUID().slice(0, 8);
  const email = `guest-${suffix}@example.test`;
  await prisma.contact.create({ data: { workspaceId: workspace.id, displayName: "Email Guest", emails: { create: [{ email: `primary-${suffix}@example.test`, normalized: `primary-${suffix}@example.test`, isPrimary: true }, { email, normalized: email, isPrimary: false }] } } });
  const phone = "+1555" + String(Date.now()).slice(-7);
  // A saved contact is found by name and chosen by the address to use; new people are typed as an address.
  await page.getByRole("combobox", { name: "Person 1: name, email, or phone" }).fill("Email Guest");
  await expect(page.getByRole("option", { name: new RegExp(email) })).toBeVisible();
  await page.screenshot({ path: `.artifacts/invitations-suggestions-${test.info().project.name}.png` });
  await page.getByRole("option", { name: new RegExp(email) }).click();
  await expect(page.getByRole("button", { name: "Change person 1: Email Guest" })).toBeVisible();
  await page.getByRole("button", { name: "Add another person" }).click();
  await page.getByRole("combobox", { name: "Person 2: name, email, or phone" }).fill(phone);
  await expect(page.getByText("New contact · invited by text message")).toBeVisible();
  await page.getByRole("textbox", { name: "Person 2: their name (optional)" }).fill("Text Guest");
  await page.getByRole("button", { name: "Add another person" }).click();
  await page.getByRole("combobox", { name: "Person 3: name, email, or phone" }).fill(`third-${suffix}@example.test`);
  await page.getByRole("textbox", { name: "Person 3: their name (optional)" }).fill("Third Guest");
  await expect(page.getByRole("button", { name: "Add another person" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    const audit = await axeInPage(page).include(".invite-page").analyze();
    expect(audit.violations.filter(item => ["serious", "critical"].includes(item.impact ?? "")), theme).toEqual([]);
    await page.screenshot({ path: `.artifacts/invitations-${theme}-${test.info().project.name}.png`, fullPage: true });
  }
  await page.getByRole("button", { name: "Add invitations to Today" }).click();
  const prepare = page.getByRole("dialog", { name: /^Add 3 invitations to Today/ });
  await expect(prepare).toContainText("Nothing is emailed yet.");
  await expect(prepare).toContainText("leaving 0");
  await expect(prepare.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await prepare.getByRole("button", { name: "Add to Today", exact: true }).click();
  await expect(page).toHaveURL(/\/jumps\?invitations=3/);
  // Today says plainly that the invitations are waiting to be sent, one button per person.
  const toSend = page.getByRole("region", { name: "3 invitations ready to send" });
  await expect(toSend).toContainText("Not sent yet.");
  await expect(toSend.getByRole("link", { name: /^Review and send the invitation to / })).toHaveCount(3);
  await page.screenshot({ path: `.artifacts/invitations-today-${test.info().project.name}.png` });
  const invites = await prisma.referralAccessInvite.findMany({ where: { inviterUserId: user.id }, include: { reminder: true } });
  expect(invites).toHaveLength(3);
  expect(invites.every(invite => invite.manualDelivery && invite.reminder?.status === "PENDING")).toBe(true);
  expect(new Set(invites.map(invite => invite.tokenHash)).size).toBe(3);
  expect(await prisma.waitlistDelivery.count({ where: { inviteId: { in: invites.map(invite => invite.id) } } })).toBe(0);
  for (const [name, protocol] of [["Email Guest", "mailto:"], ["Text Guest", "sms:"]] as const) {
    const card = page.locator(".jump-task-card:visible").filter({ hasText: name }).first();
    const review = card.getByRole("button", { name: `Review message for ${name}` });
    // Phones show a Review button; wider screens show the message in the card. Wait for either.
    await expect(review.or(card.getByLabel("Your message")).first()).toBeVisible();
    if (await review.count()) {
      // A tap before React attaches to the Review button is lost on phones; wait for hydration first.
      await expect.poll(() => review.evaluate(element => Object.keys(element).some(key => key.startsWith("__reactProps")))).toBe(true);
      await review.click();
    }
    await expect(card.getByLabel("Your message")).toHaveValue(/\/register\?invite=[A-Za-z0-9_-]{43}/);
    await expect(card.getByRole("link", { name: new RegExp(`Open .* for ${name}`) })).toHaveAttribute("href", new RegExp(`^${protocol}${name === "Email Guest" ? email : ""}`));
    const dialog = page.getByRole("dialog");
    if (await dialog.count()) {
      await dialog.getByRole("button", { name: /^Close / }).click();
      await expect(dialog).toHaveCount(0);
    }
  }
  // "Review and send" opens that invitation's message, ready for the handoff.
  await page.goto("/jumps");
  await page.getByRole("link", { name: /^Review and send the invitation to / }).first().click();
  await expect(page).toHaveURL(/[?&]jump=/);
  await expect(page.getByLabel("Your message").filter({ visible: true }).first()).toHaveValue(/\/register\?invite=[A-Za-z0-9_-]{43}/);
  const textInvite = invites.find(invite => invite.recipientPhone)!;
  const link = (textInvite.reminder!.renderedSnapshot as { body: string }).body.match(/http[^\s]+\/register\?invite=[A-Za-z0-9_-]{43}/)![0];
  const guest = await page.context().browser()!.newPage();
  await guest.goto(link);
  await expect(guest.getByRole("heading", { name: "Create your free account" })).toBeVisible();
  expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: textInvite.id } })).acceptedAt).toBeNull();
  await guest.close();
  await page.goto("/mixes/system");
  await expect(page.getByRole("heading", { name: "0 of 3 invitations remaining" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Send the invitation for / })).toHaveCount(3);
  await expect(page.getByText("Ready to send · not sent yet")).toHaveCount(3);
  await page.getByRole("button", { name: "Revoke invitation…" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm revocation", exact: true }).click();
  await expect(page.getByText("The invitation can no longer be used.")).toBeVisible();
  await page.screenshot({ path: `.artifacts/invitations-list-${test.info().project.name}.png`, fullPage: true });
  expect(await prisma.jump.count({ where: { workspaceId: workspace.id, status: "CANCELED", completionMethod: "invitation_revoked" } })).toBe(1);
});
