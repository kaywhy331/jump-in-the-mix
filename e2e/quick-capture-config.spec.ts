import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import AxeBuilder from "@axe-core/playwright";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!local, "Disposable local database only");
let workspaceId: string, userId: string, contactId: string, templateId: string;
const token = randomUUID();
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `capture-ui-${randomUUID()}@example.test`, name: "Capture review", passwordHash: "fixture-only", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: randomUUID(), name: "Capture review", members: { create: { userId } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  contactId = (await prisma.contact.create({ data: { workspaceId, displayName: "Existing Morgan", firstName: "Morgan" } })).id;
  const shared = await prisma.sharedMix.create({ data: { title: "Capture fixture template", description: "Fictional review template", category: "Current clients", industry: "Other", framework: "Check in", durationDays: 0, status: "APPROVED", steps: [{ name: "Hello", channel: "PHONE_CALL", dayOffset: 0, script: "Ask how things are going.", subject: null, body: null, longSms: false, includeOptOut: false }] } });
  templateId = shared.id;
  await prisma.sharedMixMetadata.create({ data: { sharedMixId: templateId, version: 1, triggerMode: "MANUAL_START", publishedAt: new Date() } });
});
test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: process.env.AUTH_COOKIE_NAME ?? "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => {
  if (workspaceId) { await prisma.contactActivity.deleteMany({ where: { workspaceId } }); await prisma.workspace.deleteMany({ where: { id: workspaceId } }); }
  if (userId) { await prisma.userPreference.deleteMany({ where: { userId } }); await prisma.user.deleteMany({ where: { id: userId } }); }
  if (templateId) { await prisma.sharedMixMetadata.deleteMany({ where: { sharedMixId: templateId } }); await prisma.sharedMix.deleteMany({ where: { id: templateId } }); }
});
async function openCapture(page: Page, text: string) {
  await page.goto("/contacts");
  await page.getByRole("button", { name: "Quick Add", exact: true }).filter({ visible: true }).click();
  await page.getByLabel("What do you want to remember?").fill(text);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  return page.getByRole("dialog", { name: "Quick Add", exact: true });
}
for (const theme of ["light", "dark"]) for (const width of [390, 834, 1440]) {
  test(`Quick Add review ${theme} at ${width}px saves the selected items`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.addInitScript(theme => localStorage.setItem("jitm-appearance", theme), theme);
    const name = `Avery ${theme}${width}${info.project.name.startsWith("mobile") ? "M" : "D"}`;
    const dialog = await openCapture(page, `Coffee with ${name} Thursday at 9 am at Blue Door, then call Friday at 10 am about the estimate`);
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; }, theme);
    const event = dialog.locator("section.quick-add-item").filter({ has: page.getByRole("checkbox", { name: "Event", exact: true }) });
    await event.locator("summary").click();
    await event.getByLabel("Event date", { exact: true }).fill("2027-03-01");
    await event.getByLabel(/Allow this event to overlap/).check();
    await event.locator("summary").click();
    const followUp = dialog.locator("section.quick-add-item").filter({ has: page.getByRole("checkbox", { name: "Follow-up", exact: true }) });
    await followUp.locator("summary").click();
    await followUp.getByLabel("Follow-up date", { exact: true }).fill("2027-03-02");
    await followUp.locator("summary").click();
    await expect(dialog.getByRole("button", { name: "Save all 4" })).toBeEnabled();
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    const violations = (await new AxeBuilder({ page }).include(".quick-add-dialog").withTags(["wcag2a", "wcag2aa"]).analyze()).violations;
    expect(violations).toEqual([]);
    await dialog.evaluate(node => { node.scrollTop = 0; });
    await page.screenshot({ path: `.artifacts/quick-add-config-20260920/review-${theme}-${width}-${info.project.name}.png` });
    await dialog.getByRole("button", { name: "Save all 4" }).click();
    await expect(dialog.getByText("Saved together", { exact: true })).toBeFocused();
    const contact = await prisma.contact.findFirstOrThrow({ where: { workspaceId, displayName: name } });
    expect(await prisma.calendarEntry.count({ where: { contactId: contact.id } })).toBe(1);
    expect(await prisma.jump.count({ where: { contactId: contact.id, manualOnly: true } })).toBe(1);
    await dialog.getByRole("link", { name: "View follow-up" }).click();
    await expect(page.locator(".follow-up-review-sheet[open]")).toContainText("the estimate");
  });
}

test("existing person, errors, retry and keyboard capture", async ({ page }) => {
  await prisma.calendarEntry.create({ data: { workspaceId, title: "Busy fixture", kind: "BLOCK", startsAt: new Date("2027-03-01T09:00:00Z"), endsAt: new Date("2027-03-01T10:00:00Z"), timezone: "UTC" } });
  const dialog = await openCapture(page, "Call Existing Morgan tomorrow about the estimate");
  await dialog.getByRole("button", { name: /Existing Morgan.*Choose/ }).click();
  await dialog.getByLabel("Follow-up time", { exact: true }).fill("10:00");
  await dialog.getByRole("checkbox", { name: "Event", exact: true }).check();
  await dialog.getByLabel("Event title", { exact: true }).fill("Conflicting event");
  await dialog.getByLabel("Event date", { exact: true }).fill("2027-03-01");
  await dialog.getByLabel("Start time", { exact: true }).fill("09:00");
  await dialog.getByRole("button", { name: "Save all 3" }).click();
  await expect(dialog.getByRole("alert")).toContainText(/overlap|conflict|already|busy/i);
  expect(await prisma.jump.count({ where: { contactId } })).toBe(0);
  await dialog.getByRole("checkbox", { name: "Event", exact: true }).uncheck();
  await dialog.getByRole("button", { name: "Save all 2" }).click();
  await expect(dialog.getByText("Saved together", { exact: true })).toBeVisible();
  expect(await prisma.contact.count({ where: { workspaceId, displayName: "Existing Morgan" } })).toBe(1);
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("heading", { name: "Contacts", exact: true }).click(); await page.keyboard.press("n");
  await expect(page.getByLabel("What do you want to remember?")).toBeFocused();
  await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible();
});

async function author(page: Page, name: string) {
  await page.goto("/mixes/new?custom=1");
  await page.getByLabel("Mix name", { exact: true }).fill(name);
  await page.getByRole("combobox", { name: "When should it start?", exact: true }).selectOption("MANUAL_START");
  await page.getByRole("combobox", { name: "After saving", exact: true }).selectOption("ACTIVE");
  await page.getByRole("combobox", { name: "Channel", exact: true }).selectOption("PHONE_CALL");
  await page.getByLabel("Call notes", { exact: true }).fill("Ask about the estimate.");
}
test("activation preference persists, defaults to review and allows an optional review in direct mode", async ({ page }) => {
  await prisma.userPreference.update({ where: { userId }, data: { reviewMixActivation: true } });
  await author(page, `Reviewed mix ${randomUUID()}`);
  await page.getByRole("button", { name: "Review and start", exact: true }).click();
  const review = page.getByRole("dialog", { name: "Start this mix?", exact: true });
  await expect(review).toBeVisible();
  await review.getByRole("button", { name: "Start the mix", exact: true }).click();
  // /mixes/<id>/edit forwards to the Mix library's editor view (bd125c6).
  await expect(page).toHaveURL(/\/mixes\?mix=[^&]+&view=edit&created=manual/);
  await page.goto("/account/preferences");
  await page.getByRole("combobox", { name: /^Mix activation/ }).selectOption("DIRECT");
  await page.getByRole("button", { name: "Save activation preference", exact: true }).click();
  await expect(page.getByText("Mix activation preference saved.", { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole("combobox", { name: /^Mix activation/ })).toHaveValue("DIRECT");
  const name = `Direct mix ${randomUUID()}`;
  await author(page, name);
  await page.getByRole("button", { name: "Review first", exact: true }).click(); await expect(review).toBeVisible();
  await review.getByRole("button", { name: "Keep editing", exact: true }).click();
  await page.getByRole("button", { name: "Save and activate", exact: true }).click();
  await expect(page).toHaveURL(/\/mixes\?mix=[^&]+&view=edit&created=manual/);
  expect((await prisma.mix.findFirstOrThrow({ where: { workspaceId, name } })).status).toBe("ACTIVE");
});
for (const reviewBeforeActivation of [true, false]) test(`ready-made setup honors review=${reviewBeforeActivation}`, async ({ page }) => {
  await prisma.userPreference.update({ where: { userId }, data: { reviewMixActivation: reviewBeforeActivation } });
  await page.goto(`/templates/${templateId}/use`);
  await page.getByLabel("After setup", { exact: true }).selectOption("ACTIVE");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Everyone").check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: reviewBeforeActivation ? "Review and start" : "Save and activate", exact: true }).click();
  if (reviewBeforeActivation) await page.getByRole("dialog").getByRole("button", { name: "Start the mix", exact: true }).click();
  // The setup redirects to /mixes/<id>/edit?imported=1&activated=1, which forwards to the library editor and keeps
  // only imported=1 (bd125c6); the activation itself is checked on the saved Mix.
  await expect(page).toHaveURL(/\/mixes\?mix=[^&]+&view=edit&imported=1$/);
  const imported = await prisma.mix.findUniqueOrThrow({ where: { id: new URL(page.url()).searchParams.get("mix")! } });
  expect(imported).toMatchObject({ workspaceId, source: `SHARED_MIX:${templateId}`, status: "ACTIVE" });
});
