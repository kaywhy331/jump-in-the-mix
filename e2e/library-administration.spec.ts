import { applyRenderedTheme } from "./theme-fixture";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";

const enabled = process.env.LIBRARY_E2E === "1" && process.env.AUTH_REQUIRE_ADMIN_MFA === "true" && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!enabled, "Requires isolated local library fixtures with administrator MFA enabled.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 20_000 });
const users: string[] = [], sharedIds: string[] = [];
const password = "Library browser fixture password!";
async function identity(staff = true) {
  const user = await prisma.user.create({ data: { name: "Library fixture", email: `library-browser-${randomUUID()}@example.test`, emailVerifiedAt: new Date(), passwordHash: await bcrypt.hash(password, 4),
    ...(staff ? { staffMembership: { create: { role: "EDITOR", grants: ["mixes.publish"] } } } : {}) } }); users.push(user.id);
  const token = randomBytes(32).toString("base64url");
  const session = await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  if (staff) {
    await prisma.adminMfaCredential.create({ data: { userId: user.id, enabledAt: new Date(), secretCiphertext: "browser-fixture" } });
    await prisma.adminMfaSession.create({ data: { userId: user.id, sessionId: session.id, expiresAt: session.expiresAt } });
  }
  return { user, token };
}
async function createDraft(page: Page, title: string) {
  await page.goto("/admin/templates/new");
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Description", { exact: true }).fill("A thoughtful check-in after meeting someone new.");
  await page.getByLabel("Message", { exact: true }).fill("Hi {{First Name}}, how did your event go?");
  await page.getByLabel("Reason for draft change").fill("Prepare the first reviewed relationship mix");
  await page.getByRole("button", { name: "Save draft for review" }).click();
  await expect(page).toHaveURL(/\/admin\/templates\/[a-z0-9]+\/edit\?saved=1$/);
  const id = new URL(page.url()).pathname.split("/")[3]; sharedIds.push(id); return id;
}
async function openDraft(page: Page) {
  const draft = page.locator("#library-draft");
  if (await draft.getAttribute("open") === null) await draft.locator(":scope > summary").click();
}
async function release(page: Page, label: string) {
  if (label === "Hide from customer library") await page.getByText(/^Currently published · version/).click();
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: label, exact: true }) });
  const revision = Number(await form.locator('input[name="revision"]').inputValue());
  await form.locator('textarea[name="reason"]').fill("Review and release the exact saved content");
  await form.getByLabel("Your administrator password").fill(password);
  await form.getByRole("button", { name: label, exact: true }).click();
  await expect(page).toHaveURL(url => url.searchParams.get("released") === String(revision + 1));
}
test.afterEach(async () => {
  const imports = await prisma.sharedMixImport.findMany({ where: { sharedMixId: { in: sharedIds } }, select: { id: true } });
  await prisma.sharedMixImportMetadata.deleteMany({ where: { importId: { in: imports.map(row => row.id) } } });
  await prisma.sharedMixMetadata.deleteMany({ where: { sharedMixId: { in: sharedIds } } });
  await prisma.sharedMix.deleteMany({ where: { id: { in: sharedIds } } });
  await prisma.workspace.deleteMany({ where: { ownerId: { in: users } } });
  await prisma.adminMfaSession.deleteMany({ where: { userId: { in: users } } });
  await prisma.adminMfaCredential.deleteMany({ where: { userId: { in: users } } });
  await prisma.userPreference.deleteMany({ where: { userId: { in: users } } });
  await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } }); users.length = 0; sharedIds.length = 0;
});

test("staff drafts, previews, publishes and rolls back while customers retain reviewed independent copies", async ({ page, context, browser }, info) => {
  test.setTimeout(180_000);
  const staff = await identity();
  await context.addCookies([{ name: "jitm_session", value: staff.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  const id = await createDraft(page, "Library browser review");
  expect(await prisma.workspace.count({ where: { ownerId: staff.user.id } })).toBe(0);
  const preview = page.locator("section").filter({ has: page.getByRole("heading", { name: "Saved draft preview · version 1", exact: true }) });
  await preview.getByLabel("Preview data").selectOption("long");
  await expect(preview).toContainText("Alexandria Catherine");
  await preview.getByLabel("Preview data").selectOption("blank");
  await expect(preview).toContainText("Hi there, how did your event go?");
  for (const colorScheme of ["light", "dark"] as const) for (const width of [320, 1440]) {
    await applyRenderedTheme(page, colorScheme, { width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
  await release(page, "Publish version 1");
  const customer = await identity(false);
  const workspace = await prisma.workspace.create({ data: { name: "Customer", slug: randomUUID(), ownerId: customer.user.id, members: { create: { userId: customer.user.id, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } });
  const customerContext = await browser.newContext({ baseURL: info.project.use.baseURL });
  try {
    await customerContext.addCookies([{ name: "jitm_session", value: customer.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
    const customerPage = await customerContext.newPage(); customerPage.setDefaultTimeout(20_000);
    await customerPage.goto(`/templates/${id}/use`);
    await expect(customerPage.locator('input[name="expectedVersion"]')).toHaveValue("1");
    await openDraft(page);
    await page.getByLabel("Title", { exact: true }).fill("Library browser second edition");
    await page.getByRole("textbox", { name: "Message", exact: true }).fill("Second edition prepared message.");
    await page.getByLabel("Reason for draft change").fill("Improve the second edition message");
    await page.getByRole("button", { name: "Save draft for review" }).click();
    await expect(page).toHaveURL(/saved=2$/);
    expect((await prisma.sharedMix.findUniqueOrThrow({ where: { id } })).title).toBe("Library browser review");
    await release(page, "Publish version 2");
    await customerPage.getByRole("checkbox", { name: /Everyone/ }).check();
    await customerPage.getByRole("button", { name: "Create my remix" }).click();
    await expect(customerPage.locator(".notice.error")).toContainText("changed since your preview");
    expect(await prisma.mix.count({ where: { workspaceId: workspace.id } })).toBe(0);
    await expect(customerPage.locator('input[name="expectedVersion"]')).toHaveValue("2");
    await customerPage.getByRole("checkbox", { name: /Everyone/ }).check();
    await customerPage.getByRole("button", { name: "Create my remix" }).click();
    await expect(customerPage).toHaveURL(/\/mixes\/[a-z0-9-]+\/edit\?imported=1$/);
    const imported = await prisma.mix.findFirstOrThrow({ where: { workspaceId: workspace.id }, include: { steps: { include: { stepVersion: true } } } });
    const history = page.locator("#library-history");
    await history.locator(":scope > details > summary").click();
    await history.locator("summary").filter({ hasText: /^Version 1 / }).click();
    await release(page, "Roll back to version 1");
    expect((await prisma.sharedMixMetadata.findUniqueOrThrow({ where: { sharedMixId: id } })).version).toBe(1);
    expect((await prisma.stepVersion.findUniqueOrThrow({ where: { id: imported.steps[0].stepVersionId } })).body).toBe("Second edition prepared message.");
    await release(page, "Hide from customer library");
    const hidden = await customerPage.goto(`/templates/${id}/use`); expect(hidden?.status()).toBe(404);
  } finally { await customerContext.close(); }
});

test("editors can save drafts while stale forms and removed publication rights are rejected", async ({ page, context }, info) => {
  const staff = await identity();
  await context.addCookies([{ name: "jitm_session", value: staff.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  const id = await createDraft(page, "Library permission review");
  await prisma.sharedMixMetadata.update({ where: { sharedMixId: id }, data: { controlRevision: { increment: 1 } } });
  await openDraft(page);
  await page.getByLabel("Reason for draft change").fill("Attempt save from a stale editor form");
  await page.getByRole("button", { name: "Save draft for review" }).click();
  await expect(page.locator(".notice.error")).toContainText("mix changed");
  expect(await prisma.sharedMixRevision.count({ where: { sharedMixId: id } })).toBe(1);
  await page.locator("#library-review > summary").click();
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Publish version 1", exact: true }) });
  await form.locator('textarea[name="reason"]').fill("Publication denied after permission removal");
  await form.getByLabel("Your administrator password").fill(password);
  await prisma.staffMembership.update({ where: { userId: staff.user.id }, data: { grants: [] } });
  await form.getByRole("button", { name: "Publish version 1", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/access-denied$/);
  await page.goto(`/admin/templates/${id}/edit`);
  await expect(page.getByRole("button", { name: "Publish version 1", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save draft for review" })).toBeVisible();
  const firstBeat = page.getByRole("group", { name: "Beat 1", exact: true });
  await firstBeat.getByRole("textbox", { name: "Message", exact: true }).fill("Keep these first-beat edits through reordering.");
  await page.getByRole("button", { name: "Add beat", exact: true }).click();
  const secondBeat = page.getByRole("group", { name: "Beat 2", exact: true });
  await secondBeat.getByLabel("Beat name", { exact: true }).fill("Later check-in");
  await secondBeat.getByRole("textbox", { name: "Message", exact: true }).fill("Keep this second message with its timing and options.");
  await secondBeat.getByLabel("Days after start").fill("7");
  await secondBeat.getByLabel("Send time", { exact: true }).fill("14:25");
  await secondBeat.getByLabel("Allow long SMS").check();
  await secondBeat.getByLabel("Include opt-out wording").check();
  await secondBeat.getByRole("button", { name: "Move beat 2 earlier" }).click();
  await page.getByLabel("Reason for draft change").fill("Reorder prepared beats while preserving their content");
  await page.getByRole("button", { name: "Save draft for review" }).click();
  await expect(page).toHaveURL(/saved=2$/);
  const saved = (await prisma.sharedMixRevision.findUniqueOrThrow({ where: { sharedMixId_version: { sharedMixId: id, version: 2 } } })).snapshot as { steps: Array<Record<string, unknown>> };
  expect(saved.steps).toHaveLength(2);
  expect(saved.steps[0]).toMatchObject({ name: "Later check-in", dayOffset: 7, sendTimeMinutes: 865, longSms: true, includeOptOut: true, body: "Keep this second message with its timing and options." });
  expect(saved.steps[1]).toMatchObject({ dayOffset: 0, longSms: false, includeOptOut: false, body: "Keep these first-beat edits through reordering." });
  expect((await prisma.sharedMix.findUniqueOrThrow({ where: { id } })).status).toBe("UNPUBLISHED");
});
