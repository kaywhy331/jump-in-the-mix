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
test.afterEach(async () => {
  await prisma.contactActivity.deleteMany({ where: { actorUserId: { in: users } } });
  await prisma.workspace.deleteMany({ where: { ownerId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } }); users.length = 0;
});

test("onboarding supports multiple purposes, a single starting-point dropdown, and imported contacts", async ({ page }) => {
  const { workspace } = await account(page);
  await page.goto("/onboarding");
  await page.getByRole("checkbox", { name: /Personal connections/ }).check();
  await page.getByRole("checkbox", { name: /Networking and business development/ }).check();
  await expect(page.getByRole("checkbox", { name: /^Business/ })).toBeChecked();
  await expect(page.getByText("Choose a different follow-up")).toHaveCount(0);
  await page.getByLabel("What do you want to do?").selectOption("Check in with a friend");
  await expect(page.getByLabel("Email recommended")).toBeVisible();
  await expect(page.getByLabel("Phone recommended")).toBeVisible();
  await expect(page.getByRole("link", { name: "Import contacts from a file" })).toHaveAttribute("href", "/contacts/import?onboarding=1");
  await page.getByText("Optional business details and signature", { exact: true }).click();
  await page.getByLabel("Business name (optional)").fill("Saved Business");
  const contact = await prisma.contact.create({ data: { workspaceId: workspace.id, displayName: "Imported Friend", firstName: "Imported", source: "CSV", emails: { create: { email: "friend@example.test", normalized: "friend@example.test", isPrimary: true } } } });
  await page.getByRole("button", { name: "Refresh imported contacts" }).click();
  await page.getByLabel("Choose a saved person").selectOption(contact.id);
  await expect(page.getByLabel("Business name (optional)")).toHaveValue("Saved Business");
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
  await page.getByLabel("Name (optional)").fill("Email Guest");
  await page.getByLabel("Email address or text number").fill(email);
  await page.getByRole("button", { name: "Add another person" }).click();
  await page.getByLabel("Name (optional)").nth(1).fill("Text Guest");
  await page.getByLabel("Invitation channel").nth(1).selectOption("tel");
  await page.getByLabel("Email address or text number").nth(1).fill(phone);
  await page.getByRole("button", { name: "Add another person" }).click();
  await page.getByLabel("Name (optional)").nth(2).fill("Third Guest");
  await page.getByLabel("Email address or text number").nth(2).fill(`third-${suffix}@example.test`);
  await expect(page.getByRole("button", { name: "Add another person" })).toHaveCount(0);
  await page.screenshot({ path: `.artifacts/invitations-${test.info().project.name}.png`, fullPage: true });
  page.once("dialog", async dialog => { expect(dialog.message()).toContain("leaving 0"); await dialog.accept(); });
  await page.getByRole("button", { name: "Add invitations to Today" }).click();
  await expect(page).toHaveURL(/\/jumps\?invitations=3/);
  const invites = await prisma.referralAccessInvite.findMany({ where: { inviterUserId: user.id }, include: { reminder: true } });
  expect(invites).toHaveLength(3);
  expect(invites.every(invite => invite.manualDelivery && invite.reminder?.status === "PENDING")).toBe(true);
  expect(new Set(invites.map(invite => invite.tokenHash)).size).toBe(3);
  expect(await prisma.waitlistDelivery.count({ where: { inviteId: { in: invites.map(invite => invite.id) } } })).toBe(0);
  for (const [name, protocol] of [["Email Guest", "mailto:"], ["Text Guest", "sms:"]] as const) {
    const card = page.locator(".jump-task-card:visible").filter({ hasText: name }).first();
    const review = card.getByRole("button", { name: `Review message for ${name}` });
    if (await review.count()) await review.click();
    await expect(card.getByLabel("Fine-tune before sending")).toHaveValue(/\/register\?invite=[A-Za-z0-9_-]{43}/);
    await expect(card.getByRole("link", { name: new RegExp(`Open .* for ${name}`) })).toHaveAttribute("href", new RegExp(`^${protocol}${name === "Email Guest" ? email : ""}`));
    const dialog = page.getByRole("dialog");
    if (await dialog.count()) {
      await dialog.getByRole("button", { name: /^Close / }).click();
      await expect(dialog).toHaveCount(0);
    }
  }
  const textInvite = invites.find(invite => invite.recipientPhone)!;
  const link = (textInvite.reminder!.renderedSnapshot as { body: string }).body.match(/http[^\s]+\/register\?invite=[A-Za-z0-9_-]{43}/)![0];
  const guest = await page.context().browser()!.newPage();
  await guest.goto(link);
  await expect(guest.getByRole("heading", { name: "Create your free account" })).toBeVisible();
  expect((await prisma.referralAccessInvite.findUniqueOrThrow({ where: { id: textInvite.id } })).acceptedAt).toBeNull();
  await guest.close();
  await page.goto("/mixes/system");
  await expect(page.getByRole("heading", { name: "0 of 3 invitations remaining" })).toBeVisible();
  await page.getByRole("button", { name: "Revoke invitation…" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm revocation", exact: true }).click();
  await expect(page.getByText("The invitation can no longer be used.")).toBeVisible();
  expect(await prisma.jump.count({ where: { workspaceId: workspace.id, status: "CANCELED", completionMethod: "invitation_revoked" } })).toBe(1);
});
