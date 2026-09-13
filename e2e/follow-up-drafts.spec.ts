import { createHash, randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 15_000 });
test.setTimeout(120_000);

let workspaceId: string, userId: string, contactId: string, jumpId: string;
const token = randomUUID();
const templateBody = "Hi {{First Name}}, your estimate is ready. {{SMS Signature}}";
const rendered = (firstName: string, tail = "your estimate is ready.") => `Hi ${firstName}, ${tail} Draft fixture owner`;

test.beforeAll(async () => {
  const suffix = randomUUID();
  userId = (await prisma.user.create({ data: { email: `follow-up-drafts-${suffix}@example.com`, name: "Draft fixture owner", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: `follow-up-drafts-${suffix}`, name: "Draft fixture", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Estimate text", channel: "SMS" } });
  const version = await prisma.stepVersion.create({ data: { stepTemplateId: template.id, version: 1, body: templateBody } });
  const mix = await prisma.mix.create({ data: { workspaceId, name: "Estimate plan", status: "ACTIVE", triggerMode: "MANUAL_START", steps: { create: [{ stepVersionId: version.id, dayOffset: 0, sortOrder: 1 }] } }, include: { steps: true } });
  contactId = (await prisma.contact.create({ data: { workspaceId, firstName: "Alex", displayName: "Alex Rivera", phones: { create: { phone: "+15550100200", normalized: "+15550100200", isPrimary: true } } } })).id;
  const scheduledAt = new Date(Date.now() - 60_000);
  jumpId = `${suffix}-draft-jump`;
  await prisma.jump.create({ data: {
    id: jumpId, workspaceId, contactId, mixId: mix.id, mixStepId: mix.steps[0].id, stepVersionId: version.id, scheduledAt, baseScheduledAt: scheduledAt, status: "PENDING", reason: "Estimate follow-up", uniquenessKey: jumpId,
    templateSnapshot: { subject: null, body: templateBody, script: null, channel: "SMS", originalLocalDate: scheduledAt.toISOString().slice(0, 10), timezone: "UTC" },
    renderedSnapshot: { subject: null, body: rendered("Alex"), script: null }
  } });
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
});

async function visit(page: Page) { await page.goto("/jumps"); await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "", { timeout: 60_000 }); }
const editor = (page: Page) => page.locator(`#jump-${jumpId} .editable-follow-up`);
const field = (page: Page) => editor(page).getByRole("textbox", { name: "Fine-tune before sending", exact: true });

test("keeps fine-tuned text across a reload and renders it with the contact's current details", async ({ page }) => {
  await visit(page);
  await expect(field(page)).toHaveValue(rendered("Alex"));
  await field(page).fill(rendered("Alex", "your estimate is ready to review."));
  await expect(editor(page).getByRole("status")).toHaveText("Saved");
  await expect(page.locator('[data-follow-up-draft="true"]')).toHaveCount(0);
  // Only the literal text changed, so the name and signature stay tokens in storage.
  expect((await prisma.jumpDraft.findUniqueOrThrow({ where: { jumpId_family: { jumpId, family: "TEXT" } } })).body).toBe("Hi {{First Name}}, your estimate is ready to review. {{SMS Signature}}");

  await visit(page);
  await expect(field(page)).toHaveValue(rendered("Alex", "your estimate is ready to review."));
  await expect(editor(page).getByRole("link", { name: "Open text for Alex Rivera", exact: true })).toHaveAttribute("href", `sms:+15550100200?body=${encodeURIComponent(rendered("Alex", "your estimate is ready to review."))}`);

  await prisma.contact.update({ where: { id: contactId }, data: { firstName: "Alexandra", displayName: "Alexandra Rivera" } });
  await visit(page);
  await expect(field(page)).toHaveValue(rendered("Alexandra", "your estimate is ready to review."));

  await editor(page).getByRole("button", { name: "Discard edits", exact: true }).click();
  await expect(field(page)).toHaveValue(rendered("Alexandra"));
  await expect.poll(() => prisma.jumpDraft.count({ where: { jumpId } })).toBe(0);
  await expect(page.locator('[data-follow-up-draft="true"]')).toHaveCount(0);
});

test("guards leaving only while keystrokes have not reached the server", async ({ page }) => {
  let release = () => undefined as void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/jumps/${jumpId}/draft`, async (route) => { await held; await route.continue(); });
  await visit(page);
  await field(page).fill(rendered("Alexandra", "your estimate is ready whenever you are."));
  await expect(page.locator('[data-follow-up-draft="true"]')).toHaveCount(1);
  await page.getByRole("link", { name: /This week/ }).click();
  const guard = page.getByRole("dialog", { name: "Keep your message edits?", exact: true });
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page).toHaveURL(/\/jumps$/);
  release();
  await expect(editor(page).getByRole("status")).toHaveText("Saved");
  await expect(page.locator('[data-follow-up-draft="true"]')).toHaveCount(0);
  await page.getByRole("link", { name: /This week/ }).click();
  await expect(page).toHaveURL(/range=week/);
  await expect(guard).toBeHidden();
  await prisma.jumpDraft.deleteMany({ where: { jumpId } });
});
