import { createHash, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 15_000 });
test.setTimeout(150_000);

let workspaceId: string, userId: string, contactId: string, jumpId: string, singleJumpId: string;
const token = randomUUID();
const textBody = "Hi {{First Name}}, your estimate is ready. {{SMS Signature}}";
const emailBody = "Hi {{First Name}}, the estimate is attached. {{Email Signature}}";
const callScript = "Ask about the timeline. {{Private Notes}}";
const owner = "Variant fixture owner";

test.beforeAll(async () => {
  const suffix = randomUUID();
  userId = (await prisma.user.create({ data: { email: `channel-variants-${suffix}@example.com`, name: owner, passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `channel-variants-${suffix}`, name: "Variant fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  contactId = (await prisma.contact.create({ data: { workspaceId, firstName: "Alex", displayName: "Alex Rivera", privateNotes: "Gate code 4421", phones: { create: { phone: "+15550100300", normalized: "+15550100300", isPrimary: true } }, emails: { create: { email: "alex@example.com", normalized: "alex@example.com", isPrimary: true } } } })).id;
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Estimate text", channel: "SMS" } });
  const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: textBody, variants: { create: [{ family: "EMAIL", subject: "Your estimate", body: emailBody }, { family: "CALL", script: callScript }] } } });
  const mix = await prisma.mix.create({ data: { workspaceId, name: "Estimate plan", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: [{ stepVersionId: version.id, dayOffset: 0, sortOrder: 1 }] } }, include: { steps: true } });
  const scheduledAt = new Date(Date.now() - 120_000);
  jumpId = `${suffix}-variant-jump`;
  await prisma.jump.create({ data: {
    id: jumpId, workspaceId, contactId, mixId: mix.id, mixStepId: mix.steps[0].id, stepVersionId: version.id, scheduledAt, baseScheduledAt: scheduledAt, status: "PENDING", reason: "Estimate follow-up", uniquenessKey: jumpId,
    templateSnapshot: { subject: null, body: textBody, script: null, channel: "SMS", originalLocalDate: scheduledAt.toISOString().slice(0, 10), timezone: "UTC", variants: { EMAIL: { subject: "Your estimate", body: emailBody, script: null }, CALL: { subject: null, body: null, script: callScript } } },
    renderedSnapshot: { subject: null, body: `Hi Alex, your estimate is ready. ${owner}`, script: null }
  } });
  // A single-channel follow-up for another person: no alternatives, no choice.
  const other = (await prisma.contact.create({ data: { workspaceId, firstName: "Sam", displayName: "Sam Lee", phones: { create: { phone: "+15550100301", normalized: "+15550100301", isPrimary: true } }, emails: { create: { email: "sam@example.com", normalized: "sam@example.com", isPrimary: true } } } })).id;
  const plain = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 2, body: textBody } });
  const plainMix = await prisma.mix.create({ data: { workspaceId, name: "Plain plan", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: [{ stepVersionId: plain.id, dayOffset: 0, sortOrder: 1 }] } }, include: { steps: true } });
  const later = new Date(Date.now() - 60_000);
  singleJumpId = `${suffix}-single-jump`;
  await prisma.jump.create({ data: { id: singleJumpId, workspaceId, contactId: other, mixId: plainMix.id, mixStepId: plainMix.steps[0].id, stepVersionId: plain.id, scheduledAt: later, baseScheduledAt: later, status: "PENDING", reason: "Plain follow-up", uniquenessKey: singleJumpId, templateSnapshot: { subject: null, body: textBody, script: null, channel: "SMS", originalLocalDate: later.toISOString().slice(0, 10), timezone: "UTC" }, renderedSnapshot: { subject: null, body: `Hi Sam, your estimate is ready. ${owner}`, script: null } } });
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});

async function ready(page: Page) {
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 });
  if (new URL(page.url()).pathname === "/jumps" && !(await page.getByLabel(/^Finish follow-up with/).filter({ visible: true }).isVisible())) {
    await card(page).getByRole("button", { name: /^Review / }).click();
  }
}
async function audit(page: Page) { expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]); }
const card = (page: Page) => page.locator(`#jump-${jumpId}`);
const choice = (page: Page) => card(page).getByRole("group", { name: "How to reach Alex Rivera" });
const editor = (page: Page) => card(page).locator(".editable-follow-up");
const field = (page: Page) => editor(page).getByRole("textbox", { name: "Your message", exact: true });
const selected = () => prisma.jump.findUniqueOrThrow({ where: { id: jumpId }, select: { selectedFamily: true } });

test("the Beat editor authors text, email and call versions, refuses private notes outside the call version, and reads them back", async ({ page }) => {
  const name = `Estimate with alternatives ${randomUUID().slice(0, 8)}`;
  await page.goto("/mixes/new?custom=1"); await ready(page);
  await page.getByLabel("Mix name").fill(name);
  await page.getByLabel("When should it start?").selectOption("MANUAL_START");
  const beat = page.getByRole("group", { name: "Beat 1" });
  await beat.getByLabel("Message").fill(textBody);
  // The versions live in the beat's options. The beat is a text, so only the email and call versions are offered.
  await beat.getByLabel("Options for Beat 1", { exact: true }).click();
  await beat.getByText("Text, email and call versions · generated for you", { exact: true }).click();
  await expect(beat.getByLabel("Text version")).toHaveCount(0);
  await beat.getByLabel("Email version subject").fill("Your estimate");
  await beat.getByLabel(/^Email version(?! subject)/).fill(emailBody);
  await beat.getByLabel("Call version · talking points for you").fill(callScript);
  await expect(beat.getByText("Text, email and call versions · 2 written by you", { exact: true })).toBeVisible();
  await audit(page);
  await page.getByRole("button", { name: "Create a Mix" }).click();
  await page.waitForURL(/created=manual/);
  const mix = await prisma.mix.findFirstOrThrow({ where: { workspaceId, name }, include: { steps: { include: { stepVersion: { include: { variants: { orderBy: { family: "asc" } } } } } } } });
  expect(mix.steps[0].stepVersion.body).toBe(textBody);
  expect(mix.steps[0].stepVersion.variants.map((variant) => [variant.family, variant.subject, variant.body, variant.script])).toEqual([["EMAIL", "Your estimate", emailBody, null], ["CALL", null, null, callScript]]);

  // The editor reads the versions back; private notes in an outward version are refused, and nothing changes.
  await page.goto(`/mixes/${mix.id}/edit`); await ready(page);
  const saved = page.getByRole("group", { name: "Beat 1" });
  await saved.getByLabel("Options for Beat 1", { exact: true }).click();
  await saved.getByText("Text, email and call versions · 2 written by you", { exact: true }).click();
  await expect(saved.getByLabel("Email version subject")).toHaveValue("Your estimate");
  await expect(saved.getByLabel("Call version · talking points for you")).toHaveValue(callScript);
  await saved.getByLabel(/^Email version(?! subject)/).fill(`${emailBody} {{Private Notes}}`);
  await page.getByRole("button", { name: "Save Mix" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Private notes" }).first()).toContainText("Private notes may only be inserted into Beat 1's call version.");
  expect((await prisma.stepVersionVariant.findMany({ where: { stepVersionId: mix.steps[0].stepVersionId, family: "EMAIL" } }))[0].body).toBe(emailBody);
});

test("one follow-up switches between its usable versions on Today, keeps each version's edits, hides private notes outside the call, freezes the chosen handoff and completes once", async ({ page }) => {
  await page.goto("/jumps"); await ready(page);
  // The plan's own text is the default; the single-channel card offers no choice at all.
  await expect(choice(page).getByRole("button")).toHaveText([/^Text(?:\s*Recommended)?$/, /^Email(?:\s*Recommended)?$/, /^Call(?:\s*Recommended)?$/]);
  await expect(choice(page).getByRole("button", { name: "Text" })).toHaveAttribute("aria-pressed", "true");
  await expect(field(page)).toHaveValue(`Hi Alex, your estimate is ready. ${owner}`);
  await expect(page.locator(`#jump-${singleJumpId} [data-follow-up-channel-choice]`)).toHaveCount(0);
  await audit(page);

  // Email: its own subject and wording, remembered for this follow-up, with an edit that survives switching and reloading.
  await choice(page).getByRole("button", { name: "Email" }).click();
  await expect(card(page).getByRole("textbox", { name: "Subject" })).toHaveValue("Your estimate");
  await expect(field(page)).toHaveValue(`Hi Alex, the estimate is attached. ${owner}`);
  await expect.poll(async () => (await selected()).selectedFamily).toBe("EMAIL");
  await field(page).fill(`Hi Alex, the estimate is attached. ${owner} Thanks again.`);
  // A cold dev server compiles the draft route on its first hit; allow for it.
  await expect(editor(page).getByRole("status")).toHaveText("Saved", { timeout: 45_000 });
  const emailDraft = await prisma.jumpDraft.findUniqueOrThrow({ where: { jumpId_family: { jumpId, family: "EMAIL" } } });
  expect(emailDraft.body).toBe(`${emailBody} Thanks again.`);
  await page.goto("/jumps"); await ready(page);
  await expect(choice(page).getByRole("button", { name: "Email" })).toHaveAttribute("aria-pressed", "true");
  await expect(field(page)).toHaveValue(`Hi Alex, the estimate is attached. ${owner} Thanks again.`);

  // Without an email address the email tab is disabled and the card falls back to the plan's text.
  await prisma.contactEmail.deleteMany({ where: { contactId } });
  await page.goto("/jumps"); await ready(page);
  await expect(choice(page).getByRole("button")).toHaveText([/^Text(?:\s*Recommended)?$/, /^Email(?:\s*Recommended)?$/, /^Call(?:\s*Recommended)?$/]);
  await expect(choice(page).getByRole("button", { name: "Email" })).toBeDisabled();
  await expect(choice(page).getByRole("button", { name: "Text" })).toHaveAttribute("aria-pressed", "true");
  await expect(field(page)).toHaveValue(`Hi Alex, your estimate is ready. ${owner}`);
  expect((await selected()).selectedFamily).toBe("EMAIL");
  await prisma.contactEmail.create({ data: { contactId, email: "alex@example.com", normalized: "alex@example.com", isPrimary: true } });

  // The call version shows the private notes to the owner; the text and email never carry them.
  await page.goto("/jumps"); await ready(page);
  await choice(page).getByRole("button", { name: "Call" }).click();
  await expect(card(page).locator(".prepared-call-notes")).toContainText("Ask about the timeline. Gate code 4421");
  await expect(card(page).getByRole("link", { name: "Call for Alex Rivera", exact: true })).toHaveAttribute("href", "tel:+15550100300");
  await expect.poll(async () => (await selected()).selectedFamily).toBe("CALL");
  await choice(page).getByRole("button", { name: "Text" }).click();
  await expect(field(page)).toHaveValue(`Hi Alex, your estimate is ready. ${owner}`);
  await expect(field(page)).not.toHaveValue(/Gate code/);
  await expect(card(page)).not.toContainText("Gate code");
  await expect.poll(async () => (await selected()).selectedFamily).toBeNull();

  // The chosen version's exact wording is what the handoff freezes, and the follow-up completes once.
  await choice(page).getByRole("button", { name: "Email" }).click();
  await expect(field(page)).toHaveValue(`Hi Alex, the estimate is attached. ${owner} Thanks again.`);
  await prisma.jumpAttempt.deleteMany({ where: { jumpId } });
  await editor(page).getByRole("link", { name: "Open email for Alex Rivera", exact: true }).click();
  const tray = page.getByLabel(/^Finish follow-up with/).filter({ visible: true });
  await expect(tray).toBeVisible();
  await expect.poll(() => prisma.jumpAttempt.count({ where: { jumpId } }), { timeout: 45_000 }).toBe(1);
  const attempt = await prisma.jumpAttempt.findFirstOrThrow({ where: { jumpId } });
  expect(attempt).toMatchObject({ channel: "EMAIL", family: "EMAIL", subject: "Your estimate", body: `Hi Alex, the estimate is attached. ${owner} Thanks again.`, draftRevision: emailDraft.revision });
  await tray.getByRole("button", { name: "Sent", exact: true }).click();
  await expect.poll(async () => (await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } })).status, { timeout: 30_000 }).toBe("DONE");
  expect(await prisma.jump.count({ where: { contactId } })).toBe(1);
  expect(await prisma.contactActivity.count({ where: { jumpId, kind: "JUMP_OUTCOME" } })).toBe(1);
  expect(await prisma.jumpAttempt.count({ where: { jumpId } })).toBe(1);
  // The other versions' drafts are untouched history until retention.
  expect(await prisma.jumpDraft.count({ where: { jumpId } })).toBe(1);
});
