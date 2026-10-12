import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires a disposable loopback database.");
test.setTimeout(120_000);
test.use({ screenshot: "off", trace: "off", video: "off" });
let userId = "", workspaceId = "";

test.beforeEach(async ({ context }, info) => {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { name: "Retry fixture owner", email: `onboarding-retry-${suffix}@example.test`, emailVerifiedAt: new Date() } }); userId = user.id;
  workspaceId = (await prisma.workspace.create({ data: { name: "Retry browser fixture", slug: suffix, ownerId: userId, members: { create: { userId } }, profile: { create: { onboardingDone: false } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  await context.addCookies([{ name: "jitm_session", value: token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
});
test.afterEach(async () => {
  await prisma.contactActivity.deleteMany({ where: { workspaceId } });
  await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

async function enterPerson(page: Page, name = "Riley Retry", phone = "+1 (202) 555-0142") {
  await expect(page.getByRole("button", { name: "Set up a whole pipeline instead", exact: true })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Mobile phone").fill(phone);
  // The follow-up starts from below its preview (D73), once the preview has loaded.
  await expect(prepare(page)).toBeEnabled();
}

const prepare = (page: Page) => page.getByRole("button", { name: /^Start .*follow-up$/ });

test("a lost onboarding response recovers once by keyboard and the tester can report feedback", async ({ page }, info) => {
  await page.goto("/onboarding");
  await enterPerson(page);
  let submissions = 0;
  await page.route("**/onboarding**", async route => {
    if (route.request().method() !== "POST") return route.continue();
    submissions++;
    if (submissions === 1) {
      const response = await route.fetch({ maxRedirects: 0 });
      expect(response.status()).toBeLessThan(400);
      await route.abort("failed");
    } else await route.continue();
  });
  await prepare(page).click();
  const form = page.locator("form").filter({ has: prepare(page) });
  const alert = form.getByRole("alert");
  await expect(alert).toContainText("couldn’t confirm this save");
  await expect(alert).toBeFocused();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Riley Retry");
  expect(await prisma.contact.count({ where: { workspaceId } })).toBe(1);
  await mkdir(".artifacts/tester-onboarding/captures", { recursive: true });
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme as "light" | "dark" });
    expect((await axeInPage(page).include(".first-win-onboarding").analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await alert.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.artifacts/tester-onboarding/captures/retry-${info.project.name}-${theme}.png` });
    await page.evaluate(() => document.documentElement.style.fontSize = "200%");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await prepare(page).scrollIntoViewIfNeeded();
    expect((await prepare(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.evaluate(() => document.documentElement.style.fontSize = "");
  }
  await prepare(page).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/jumps\?.*welcome=1/);
  await expect(page.getByText("Your first follow-up for Riley Retry is ready.")).toBeVisible();
  expect(submissions).toBe(2);
  expect(await prisma.contact.count({ where: { workspaceId } })).toBe(1);
  expect(await prisma.jumpDate.count({ where: { workspaceId } })).toBe(1);
  expect(await prisma.mixAssignment.count({ where: { workspaceId } })).toBe(1);
  expect(await prisma.idempotencyKey.count({ where: { workspaceId, key: { startsWith: "onboarding:" } } })).toBe(1);

  await page.goto("/help#contact-support");
  const feedback = page.locator("#contact-support form");
  await feedback.getByLabel("Short title").fill("Synthetic first follow-up feedback");
  await feedback.getByLabel("What happened?").fill("My synthetic connection dropped during setup. Retrying opened the original first follow-up.");
  await feedback.getByRole("button", { name: "Send feedback", exact: true }).click();
  await expect(page).toHaveURL(/\/account\/tickets\/[^/?]+\?created=1/);
  expect(await prisma.supportTicket.count({ where: { workspaceId, title: "Synthetic first follow-up feedback" } })).toBe(1);
});

test("a request lost before the server save can be retried with the preserved entries", async ({ page }) => {
  await page.goto("/onboarding");
  await enterPerson(page);
  let blocked = false;
  await page.route("**/onboarding**", async route => {
    if (route.request().method() === "POST" && !blocked) { blocked = true; return route.abort("failed"); }
    return route.continue();
  });
  await prepare(page).click();
  await expect(page.locator("form").filter({ has: prepare(page) }).getByRole("alert")).toContainText("couldn’t confirm this save");
  expect(await prisma.contact.count({ where: { workspaceId } })).toBe(0);
  await prepare(page).click();
  await expect(page).toHaveURL(/\/jumps\?.*welcome=1/);
  expect(await prisma.contact.count({ where: { workspaceId } })).toBe(1);
});

test("Run setup again opens a fresh form that can intentionally prepare another person", async ({ page }) => {
  await page.goto("/onboarding");
  await enterPerson(page);
  await prepare(page).click();
  await expect(page).toHaveURL(/\/jumps\?.*welcome=1/);
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Setup is complete" })).toBeVisible();
  await page.getByRole("link", { name: "Run setup again" }).click();
  await enterPerson(page, "Morgan Fresh", "+1 (202) 555-0143");
  await prepare(page).click();
  await expect(page).toHaveURL(/\/jumps\?.*welcome=1/);
  expect(await prisma.contact.count({ where: { workspaceId } })).toBe(2);
  expect(await prisma.idempotencyKey.count({ where: { workspaceId, key: { startsWith: "onboarding:" } } })).toBe(2);
});
