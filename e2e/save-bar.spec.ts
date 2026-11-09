import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

const routes = ["/contacts/new", "/settings/business", "/settings/new-contacts", "/settings/notifications", "/account/preferences"];
const output = ".artifacts/uxa17";
let userId: string, workspaceId: string;
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires disposable local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block", actionTimeout: 15000 });
test.beforeEach(async ({ context }) => {
  userId = (await prisma.user.create({ data: { name: "Casey Example", email: `save-${randomUUID()}@example.test`, emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Save bar fixture", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true, company: "Example Repairs", smsSignature: "Casey", emailSignature: "Casey" } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  const token = randomUUID();
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
  await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Lax" }]);
  await mkdir(output, { recursive: true });
});
test.afterEach(async () => {
  await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

async function open(page: Page, route: string) {
  await page.goto(route);
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
  await expect(page.locator(".save-bar").first()).toBeVisible();
}
async function stays(page: Page, form: ReturnType<Page["locator"]>) {
  await expect(form.locator(".form-guard-status")).toContainText("Unsaved changes");
  const url = page.url();
  const dialog = page.waitForEvent("dialog");
  page.once("dialog", prompt => prompt.dismiss());
  await form.locator(".save-bar").getByRole("link", { name: "Cancel", exact: true }).click();
  expect((await dialog).message()).toContain("without saving");
  expect(page.url()).toBe(url);
}

test("the five pages retain their values after Save and warn before Cancel", async ({ page }) => {
  test.setTimeout(180000);
  await open(page, routes[0]);
  await page.getByLabel("First name", { exact: true }).fill("Save Bar Contact");
  await stays(page, page.locator("form.contact-editor"));
  await page.getByRole("button", { name: "Save contact", exact: true }).click();
  await expect(page).toHaveURL(/\/contacts\/[^/?]+\?created=1/);
  expect(await prisma.contact.count({ where: { workspaceId, firstName: "Save Bar Contact" } })).toBe(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Save Bar Contact", exact: true }).first()).toBeVisible();

  await open(page, routes[1]);
  await page.getByLabel("Business name", { exact: true }).fill("Saved Example Repairs");
  await stays(page, page.locator("form:has(input[name=company])"));
  await page.getByRole("button", { name: "Save business details", exact: true }).click();
  await expect(page).toHaveURL(/saved=1/);
  await page.reload();
  await expect(page.getByLabel("Business name", { exact: true })).toHaveValue("Saved Example Repairs");
  expect(await prisma.workspaceProfile.findUnique({ where: { workspaceId } })).toMatchObject({ company: "Saved Example Repairs" });

  await open(page, routes[2]);
  await page.getByRole("radio", { name: /Choose when adding/ }).check();
  await stays(page, page.locator("form:has(input[name=placement])"));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/saved=1/);
  await page.reload();
  await expect(page.getByRole("radio", { name: /Choose when adding/ })).toBeChecked();
  expect(await prisma.workspacePreference.findUnique({ where: { workspaceId } })).toMatchObject({ newContactPlacement: "ASK" });

  await open(page, routes[3]);
  await page.getByLabel("Morning digest", { exact: false }).check();
  await page.getByRole("combobox", { name: /^Send at/ }).selectOption("9");
  await stays(page, page.locator("form:has(select[name=digestHour])"));
  await expect(page.getByRole("button", { name: "Send me a test reminder", exact: true })).not.toHaveClass(/primary/);
  await page.getByRole("button", { name: "Save email reminders", exact: true }).click();
  await expect(page).toHaveURL(/saved=1/);
  await page.reload();
  await expect(page.getByRole("combobox", { name: /^Send at/ })).toHaveValue("9");
  expect(await prisma.notificationPreference.findUnique({ where: { workspaceId } })).toMatchObject({ emailDigestEnabled: true, digestHour: 9 });

  await open(page, routes[4]);
  await page.getByLabel("Display name", { exact: true }).fill("Saved Casey");
  await stays(page, page.locator("form:has(input[name=name])"));
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page).toHaveURL(/personalSaved=1/);
  await page.reload();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Saved Casey");
  expect(await prisma.user.findUnique({ where: { id: userId } })).toMatchObject({ name: "Saved Casey" });
});

test("section saves protect other drafts, and phone-country review keeps its validation path", async ({ page }) => {
  test.setTimeout(180000);
  await open(page, routes[4]);
  await page.getByLabel("Display name", { exact: true }).fill("Other draft");
  await page.getByRole("combobox", { name: /^Country for phone numbers/ }).selectOption("GB");
  const warning = page.waitForEvent("dialog");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Review change", exact: true }).click();
  expect((await warning).message()).toContain("other form’s changes");
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Other draft");
  await page.getByLabel("Display name", { exact: true }).fill("Casey Example");
  const dialogs: string[] = [];
  page.on("dialog", dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
  await page.getByRole("button", { name: "Review change", exact: true }).click();
  await expect(page).toHaveURL(/phoneRegion=GB/);
  expect(dialogs).toEqual([]);
  await page.getByRole("button", { name: "Use United Kingdom", exact: true }).click();
  await expect(page).toHaveURL(/phoneRegionSaved=1/);
  expect(await prisma.workspacePreference.findUnique({ where: { workspaceId } })).toMatchObject({ phoneRegion: "GB" });
  await page.getByRole("combobox", { name: /^Mix activation/ }).selectOption("DIRECT");
  await page.getByRole("button", { name: "Save activation preference", exact: true }).click();
  await expect(page).toHaveURL(/mixActivationSaved=1/);
  expect(await prisma.userPreference.findUnique({ where: { userId } })).toMatchObject({ reviewMixActivation: false });
  await page.getByLabel("Quiet days before a suggestion", { exact: true }).fill("75");
  await page.getByRole("button", { name: "Save check-in preferences", exact: true }).click();
  await expect(page).toHaveURL(/quietDaysSaved=1/);
  expect(await prisma.workspacePreference.findUnique({ where: { workspaceId } })).toMatchObject({ quietDays: 75 });
  await page.getByLabel("Default follow-up time", { exact: true }).fill("11:25");
  await page.getByRole("button", { name: "Save scheduling defaults", exact: true }).click();
  await expect(page).toHaveURL(/schedulingSaved=1/);
  expect(await prisma.workspacePreference.findUnique({ where: { workspaceId } })).toMatchObject({ defaultFollowUpMinutes: 685 });
  await page.getByRole("link", { name: "Add working hours and journey preferences", exact: true }).click();
  await page.getByLabel("Open from", { exact: true }).fill("08:30");
  await page.getByRole("button", { name: "Save journey preferences", exact: true }).click();
  await expect(page).toHaveURL(/journeySaved=1/);
  expect(await prisma.workspacePreference.findUnique({ where: { workspaceId } })).toMatchObject({ journeyPreferences: { workStart: 510 } });
});

for (const route of routes) test(`${route} shared bar fits the viewport matrix, keyboard and enlarged text`, async ({ page }, info) => {
  test.setTimeout(180000);
  await open(page, route);
  const slug = route.replaceAll("/", "-");
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    for (const width of [320, 375, 390, 767, 768, 834, 900, 901, 1099, 1100, 1194, 1199, 1200, 1279, 1280, 1440, 1599, 1600, 1699, 1700, 1920, 2560, 3440, 3840]) {
      await page.setViewportSize({ width, height: width === 375 ? 667 : 900 });
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      for (const bar of await page.locator(".save-bar").all()) {
        await bar.scrollIntoViewIfNeeded();
        const bounds = (await bar.boundingBox())!;
        const cancel = (await bar.getByRole("link", { name: "Cancel", exact: true }).boundingBox())!;
        const save = (await bar.getByRole("button").boundingBox())!;
        expect(bounds.height).toBeLessThanOrEqual(72);
        expect(Math.abs(cancel.y - save.y)).toBeLessThanOrEqual(1);
        expect(save.x).toBeGreaterThanOrEqual(cancel.x + cancel.width + 8);
        for (const button of [cancel, save]) { expect(button.height).toBeGreaterThanOrEqual(44); expect(button.width).toBeGreaterThanOrEqual(44); }
        if (width <= 900) {
          const nav = (await page.locator(".mobile-nav").boundingBox())!;
          expect(bounds.y + bounds.height).toBeLessThanOrEqual(nav.y);
        }
      }
      if (width === 375) await appendFile(`${output}/layout-measurements.jsonl`, JSON.stringify({ project: info.project.name, route, theme, width, height: 667, bars: await page.locator(".save-bar").evaluateAll(bars => bars.map(bar => ({ height: bar.getBoundingClientRect().height, position: getComputedStyle(bar).position }))) }) + "\n");
      if ([375, 834, 1194, 1920].includes(width)) await page.screenshot({ path: `${output}/${info.project.name}${slug}-${width}-${theme}.png` });
    }
    for (const viewport of [{ width: 844, height: 390 }, { width: 1280, height: 600 }]) {
      await page.setViewportSize(viewport);
      for (const bar of await page.locator(".save-bar").all()) expect(await bar.evaluate(el => getComputedStyle(el).position)).toBe(viewport.height <= 480 ? "static" : "sticky");
    }
    await page.setViewportSize({ width: 375, height: 667 });
    const bar = page.locator(".save-bar").first();
    await bar.getByRole("link", { name: "Cancel", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(bar.getByRole("button")).toBeFocused();
    expect(await bar.getByRole("button").evaluate(el => parseFloat(getComputedStyle(el).outlineWidth))).toBeGreaterThanOrEqual(3);
    expect((await axeInPage(page).include(".save-bar").analyze()).violations).toEqual([]);
    const text = await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    for (const width of [320, 375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      for (const button of await page.locator(".save-bar .button").all()) expect(await button.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true);
    }
    await text.evaluate(el => el.parentNode?.removeChild(el));
    await page.evaluate(() => { document.documentElement.style.zoom = "1.1"; });
    await page.setViewportSize({ width: 991, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.evaluate(() => { document.documentElement.style.zoom = ""; });
  }
});
