import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { APPROVED_STAGING_TARGETS, SMOKE_ACCOUNT_NAME, SMOKE_WORKSPACE_NAME } from "../src/lib/staging-smoke-account";

/**
 * Authenticated smoke for one follow-up's channel alternatives (Slice 3) on the published private
 * test site: switching between the usable versions, an edit kept per version across a reload,
 * private notes only under the call, the chosen version frozen by the handoff, the return tray
 * surviving a reload mid-handoff, and one completion. The fixtures are written to the synthetic
 * smoke account's workspace through the site's own database and removed afterwards, so the seed's
 * "no contacts" guard holds again. The suite skips unless every guard names the approved test site.
 */
const base = (process.env.STAGING_BASE_URL ?? "").trim().replace(/\/+$/, "");
const target = (process.env.STAGING_SMOKE_TARGET ?? "").trim().replace(/\/+$/, "");
const userEmail = (process.env.STAGING_SMOKE_USER_EMAIL ?? "").trim().toLowerCase();
const userPassword = process.env.STAGING_SMOKE_USER_PASSWORD ?? "";
const databaseUrl = process.env.DATABASE_URL ?? "";
const remoteDatabase = /^postgres(?:ql)?:\/\//.test(databaseUrl) && !/@(?:localhost|127\.0\.0\.1)(?::\d+)?\//.test(databaseUrl);
const enabled = Boolean(base) && (APPROVED_STAGING_TARGETS as readonly string[]).includes(base) && target === base && Boolean(userEmail && userPassword) && remoteDatabase;

test.skip(!enabled, "Runs only with STAGING_BASE_URL naming the approved test site, STAGING_SMOKE_TARGET equal to it, the smoke credentials, and the site's own DATABASE_URL.");
test.use({ actionTimeout: 20_000 });
test.setTimeout(240_000);

const textBody = "Hi {{First Name}}, your estimate is ready.";
const emailBody = "Hi {{First Name}}, the estimate is attached.";
const callScript = "Ask about the timeline. {{Private Notes}}";
let workspaceId = "", contactId = "", mixId = "", templateId = "", jumpId = "", displayName = "";

test.beforeAll(async () => {
  const user = await prisma.user.findUnique({ where: { email: userEmail }, select: { id: true, name: true, ownedWorkspaces: { select: { id: true, name: true } } } });
  if (!user || user.name !== SMOKE_ACCOUNT_NAME || user.ownedWorkspaces.length !== 1 || user.ownedWorkspaces[0].name !== SMOKE_WORKSPACE_NAME) {
    throw new Error("The smoke account is not the synthetic one; nothing was written.");
  }
  workspaceId = user.ownedWorkspaces[0].id;
  const suffix = randomUUID().slice(0, 8);
  displayName = `Variant Smoke ${suffix}`;
  const email = `variant-smoke-${suffix}@example.com`;
  contactId = (await prisma.contact.create({ data: { workspaceId, firstName: "Alex", lastName: `Smoke ${suffix}`, displayName, privateNotes: "Gate code 4421", phones: { create: { phone: "+15550100300", normalized: "+15550100300", isPrimary: true } }, emails: { create: { email, normalized: email, isPrimary: true } } } })).id;
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: `Estimate text (smoke ${suffix})`, channel: "SMS", isActive: false } });
  templateId = template.id;
  const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: textBody, variants: { create: [{ family: "EMAIL", subject: "Your estimate", body: emailBody }, { family: "CALL", script: callScript }] } } });
  const mix = await prisma.mix.create({ data: { workspaceId, name: `Estimate plan (smoke ${suffix})`, status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: [{ stepVersionId: version.id, dayOffset: 0, sortOrder: 1 }] } }, include: { steps: true } });
  mixId = mix.id;
  const scheduledAt = new Date(Date.now() - 120_000);
  jumpId = `smoke-${suffix}-variant-jump`;
  await prisma.jump.create({ data: {
    id: jumpId, workspaceId, contactId, mixId, mixStepId: mix.steps[0].id, stepVersionId: version.id, scheduledAt, baseScheduledAt: scheduledAt, status: "PENDING", reason: "Estimate follow-up", uniquenessKey: jumpId,
    templateSnapshot: { subject: null, body: textBody, script: null, channel: "SMS", originalLocalDate: scheduledAt.toISOString().slice(0, 10), timezone: "UTC", variants: { EMAIL: { subject: "Your estimate", body: emailBody, script: null }, CALL: { subject: null, body: null, script: callScript } } },
    renderedSnapshot: { subject: null, body: "Hi Alex, your estimate is ready.", script: null }
  } });
});
test.afterAll(async () => {
  // Only this run's rows; the contact cascades its follow-up, drafts, attempts and activity.
  if (contactId) await prisma.contact.deleteMany({ where: { id: contactId, workspaceId } });
  if (mixId) { await prisma.mixStep.deleteMany({ where: { mixId } }); await prisma.mix.deleteMany({ where: { id: mixId, workspaceId } }); }
  if (templateId) await prisma.stepTemplate.deleteMany({ where: { id: templateId, workspaceId } });
  await prisma.$disconnect();
});

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(userEmail);
  await page.getByLabel("Password", { exact: true }).fill(userPassword);
  await Promise.all([page.waitForURL(/\/(jumps|onboarding)(\?|$)/), page.getByRole("button", { name: "Sign in" }).click()]);
}
async function ready(page: Page) {
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 });
  if (new URL(page.url()).pathname === "/jumps" && !(await page.getByLabel(/^Finish follow-up with/).filter({ visible: true }).isVisible())) {
    await card(page).getByRole("button", { name: /^Review / }).click();
    await card(page).getByText("Change contact method", { exact: true }).click();
  }
}
const card = (page: Page) => page.locator(`#jump-${jumpId}`);
const choice = (page: Page) => card(page).getByRole("group", { name: `How to reach ${displayName}` });
const editor = (page: Page) => card(page).locator(".editable-follow-up");
const field = (page: Page) => editor(page).getByRole("textbox", { name: "Your message", exact: true });
const tray = (page: Page) => page.getByLabel(/^Finish follow-up with/).filter({ visible: true });
const selected = () => prisma.jump.findUniqueOrThrow({ where: { id: jumpId }, select: { selectedFamily: true } });

test("on the published site one follow-up switches versions, keeps each version's edit, hides private notes outside the call, keeps its handoff across a reload and completes once", async ({ page }) => {
  await signIn(page);
  await page.goto("/jumps"); await ready(page);
  // The plan's own text is the default.
  await expect(choice(page).getByRole("button")).toHaveText(["Text", "Email", "Call"]);
  await expect(choice(page).getByRole("button", { name: "Text" })).toHaveAttribute("aria-pressed", "true");
  await expect(field(page)).toHaveValue("Hi Alex, your estimate is ready.");

  // Email: its own subject and wording, remembered for this follow-up, with an edit that survives a reload.
  await choice(page).getByRole("button", { name: "Email" }).click();
  await expect(card(page).getByRole("textbox", { name: "Subject" })).toHaveValue("Your estimate");
  await expect(field(page)).toHaveValue("Hi Alex, the estimate is attached.");
  await expect.poll(async () => (await selected()).selectedFamily).toBe("EMAIL");
  await field(page).fill("Hi Alex, the estimate is attached. Thanks again.");
  await expect(editor(page).getByRole("status")).toHaveText("Saved", { timeout: 45_000 });
  const emailDraft = await prisma.jumpDraft.findUniqueOrThrow({ where: { jumpId_family: { jumpId, family: "EMAIL" } } });
  expect(emailDraft.body).toBe(`${emailBody} Thanks again.`);
  await page.goto("/jumps"); await ready(page);
  await expect(choice(page).getByRole("button", { name: "Email" })).toHaveAttribute("aria-pressed", "true");
  await expect(field(page)).toHaveValue("Hi Alex, the estimate is attached. Thanks again.");

  // The call version shows the private notes to the owner; the text and email never carry them.
  await choice(page).getByRole("button", { name: "Call" }).click();
  await expect(card(page).locator(".prepared-call-notes")).toContainText("Ask about the timeline. Gate code 4421");
  await expect(card(page).getByRole("link", { name: `Call for ${displayName}`, exact: true })).toHaveAttribute("href", "tel:+15550100300");
  await expect.poll(async () => (await selected()).selectedFamily).toBe("CALL");
  await choice(page).getByRole("button", { name: "Text" }).click();
  await expect(field(page)).toHaveValue("Hi Alex, your estimate is ready.");
  await expect(card(page)).not.toContainText("Gate code");
  await expect.poll(async () => (await selected()).selectedFamily).toBeNull();

  // The chosen version's exact wording is what the handoff freezes.
  await choice(page).getByRole("button", { name: "Email" }).click();
  await expect(field(page)).toHaveValue("Hi Alex, the estimate is attached. Thanks again.");
  await expect(card(page)).not.toContainText("Gate code");
  await editor(page).getByRole("link", { name: `Open email for ${displayName}`, exact: true }).click();
  await expect(tray(page)).toBeVisible();
  await expect.poll(() => prisma.jumpAttempt.count({ where: { jumpId } }), { timeout: 45_000 }).toBe(1);
  const attempt = await prisma.jumpAttempt.findFirstOrThrow({ where: { jumpId } });
  expect(attempt).toMatchObject({ channel: "EMAIL", family: "EMAIL", subject: "Your estimate", body: "Hi Alex, the estimate is attached. Thanks again.", draftRevision: emailDraft.revision });
  expect(attempt.body).not.toContain("Gate code");

  // Return recovery: the handoff is still waiting after the page is reloaded, and the outcome completes the follow-up once.
  await page.reload(); await ready(page);
  await expect(tray(page)).toBeVisible();
  await expect(tray(page)).toContainText(displayName);
  await tray(page).getByRole("button", { name: "Sent", exact: true }).click();
  await expect.poll(async () => (await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } })).status, { timeout: 30_000 }).toBe("DONE");
  expect(await prisma.jump.count({ where: { contactId } })).toBe(1);
  expect(await prisma.contactActivity.count({ where: { jumpId, kind: "JUMP_OUTCOME" } })).toBe(1);
  expect(await prisma.jumpAttempt.count({ where: { jumpId } })).toBe(1);
  expect(await prisma.jumpDraft.count({ where: { jumpId } })).toBe(1);
});
