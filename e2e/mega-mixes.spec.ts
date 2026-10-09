import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block", actionTimeout: 15_000 });
test.setTimeout(180_000);
let userId: string, workspaceId: string, token: string;
const errors: string[] = [];
test.beforeEach(async ({ context, page }) => {
  errors.length = 0; page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") console.log("Browser error:", message.text()); });
  userId = (await prisma.user.create({ data: { name: "Journey fixture", email: `mega-browser-${randomUUID()}@example.invalid`, emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Journey fixture", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  token = randomUUID();
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
});
test.afterEach(async () => {
  await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  expect(errors).toEqual([]);
});

test("browse a whole journey, install it once, open its actual map and editable Mixes", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/mixes");
  await page.getByRole("link", { name: "Choose a complete Mega-Mix", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Contractor Mega-Mix", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Included Mixes and connections" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Mega-Mix setup" })).toContainText("Make this fit your day");
  await page.getByRole("heading", { name: "Make this fit your day", exact: true }).waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Review my setup", exact: true }).click();
  await page.getByRole("checkbox", { name: "I’ve reviewed my journey and preferences." }).check();
  await page.getByRole("button", { name: "Add Contractor Mega-Mix", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your pipeline is ready" })).toBeVisible();
  expect(await prisma.mix.count({ where: { workspaceId } })).toBe(13);
  expect(await prisma.mixAssignment.count({ where: { workspaceId } })).toBe(0);
  expect(await prisma.jump.count({ where: { workspaceId } })).toBe(0);
  await page.getByRole("link", { name: "Open my Journey", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Journey map", exact: true })).toBeVisible();
  await expect(page.getByText("Estimate follow-up", { exact: true }).first()).toBeVisible();
  const map = await prisma.mixWorkflow.findUniqueOrThrow({ where: { workspaceId } });
  expect((map.configuration as { rules: unknown[] }).rules).toHaveLength(13);
  await page.screenshot({ path: ".artifacts/onboarding-journey-20260922/installed-journey-1920.png" });
  const person = await prisma.contact.create({ data: { workspaceId, displayName: "Pipeline customer", firstName: "Pipeline" } });
  await page.goto("/templates/journeys?journey=contractor");
  await expect(page.getByRole("heading", { name: "Already in your Journey" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Contractor Mega-Mix" })).toHaveCount(0);
  await page.getByRole("complementary", { name: "Mega-Mix setup" }).getByRole("link", { name: "Estimate follow-up On" }).click();
  await expect(page.getByRole("heading", { name: "Estimate follow-up", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start for someone", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Start for someone", exact: true }).click();
  await page.getByRole("combobox", { name: "Person", exact: true }).selectOption(person.id);
  await page.getByRole("button", { name: "Start this Mix", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Start saved. Follow-ups are being prepared" })).toBeVisible();
  expect(await prisma.mixWorkflowInstance.count({ where: { workspaceId, contactId: person.id } })).toBe(1);
  const exported = await (await page.request.get("/api/account/export")).json();
  expect(exported.megaMixInstallations).toHaveLength(1);
});

test("onboarding can prepare a full journey without adding a contact, while keeping the one-person draft", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prisma.workspaceProfile.update({ where: { workspaceId }, data: { onboardingDone: false } });
  await page.goto("/onboarding");
  await page.getByRole("radio", { name: /Choose individual Mixes/ }).check();
  await page.getByRole("button", { name: "Start with one person and one follow-up instead" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Unfinished person");
  await page.getByRole("radio", { name: /A complete Mega-Mix/ }).check();
  await page.getByRole("radio", { name: /Choose individual Mixes/ }).check();
  await page.getByRole("button", { name: "Start with one person and one follow-up instead" }).click();
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Unfinished person");
  await page.getByRole("radio", { name: /A complete Mega-Mix/ }).check();
  await page.getByRole("combobox", { name: "Your Mega-Mix", exact: true }).selectOption("photographer");
  await page.getByText("Business name and message signature", { exact: true }).click();
  await page.getByRole("textbox", { name: "Business name (optional)", exact: true }).fill("Studio fixture");
  await page.getByRole("button", { name: "Review my setup", exact: true }).click();
  await page.getByText("Preview the Photographer journey", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Photographer Mega-Mix" })).toBeVisible();
  await page.getByText("Preview the Photographer journey", { exact: true }).click();
  await page.getByRole("heading", { name: /^(Make this fit your day|Ready when you are)$/ }).waitFor({ state: "visible" });
  if (await page.getByRole("button", { name: "Review my setup", exact: true }).isVisible()) await page.getByRole("button", { name: "Review my setup", exact: true }).click();
  await page.getByRole("checkbox", { name: "I’ve reviewed my journey and preferences." }).check();
  await page.getByRole("button", { name: "Add Photographer Mega-Mix", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your pipeline is ready" })).toBeVisible();
  expect(await prisma.workspaceProfile.findUnique({ where: { workspaceId } })).toMatchObject({ onboardingDone: true, company: "Studio fixture" });
  expect(await prisma.contact.count({ where: { workspaceId } })).toBe(0);
  expect(await prisma.mix.count({ where: { workspaceId } })).toBe(11);
});

test("both themes reflow, allow keyboard preview and keep setup reachable", async ({ page }) => {
  const dir = ".artifacts/onboarding-journey-20260922"; await mkdir(dir, { recursive: true });
  await page.goto("/templates/journeys?journey=contractor");
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => { localStorage.setItem("jitm-appearance", theme); document.documentElement.dataset.theme = theme; }, theme);
    for (const width of [320, 390, 834, 1440, 1920]) {
      await page.setViewportSize({ width, height: width > 1000 ? 1000 : 844 });
      if (width < 1200) await page.getByRole("button", { name: "Preview", exact: true }).click();
      const summary = page.getByRole("list", { name: "Included Mixes and connections" }).locator("summary").first();
      await summary.focus(); await page.keyboard.press("Enter");
      await expect(page.getByText(/thanks for getting in touch\. What work/)).toBeVisible();
      await page.keyboard.press("Enter");
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({ path: `${dir}/preview-${width}-${theme}.png` });
      expect((await axeInPage(page).analyze()).violations).toEqual([]);
      if (width < 1200) {
        await page.getByRole("button", { name: "Add journey", exact: true }).click();
        await expect(page.getByRole("button", { name: "Review my setup", exact: true })).toBeVisible();
        await page.screenshot({ path: `${dir}/setup-${width}-${theme}.png` });
        expect((await axeInPage(page).analyze()).violations).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
      }
    }
  }
});

test("a stale preview saves nothing and keeps the setup available for correction", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/templates/journeys?journey=contractor");
  await page.getByRole("heading", { name: /^(Make this fit your day|Ready when you are)$/ }).waitFor({ state: "visible" });
  if (await page.getByRole("button", { name: "Review my setup", exact: true }).isVisible()) await page.getByRole("button", { name: "Review my setup", exact: true }).click();
  await page.getByRole("checkbox", { name: "I’ve reviewed my journey and preferences." }).check();
  await page.locator('input[name="version"]').evaluate((input: HTMLInputElement) => { input.value = "0"; });
  await page.getByRole("button", { name: "Add Contractor Mega-Mix" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This Mega-Mix has changed" })).toBeVisible();
  expect(await prisma.mix.count({ where: { workspaceId } })).toBe(0);
  await expect(page.getByRole("checkbox", { name: "I’ve reviewed my journey and preferences." })).toBeChecked();
  await page.locator('input[name="version"]').evaluate((input: HTMLInputElement) => { input.value = "1"; });
  await page.getByRole("button", { name: "Add Contractor Mega-Mix" }).click();
  await expect(page.getByRole("heading", { name: "Your pipeline is ready" })).toBeVisible();
  expect(await prisma.mix.count({ where: { workspaceId } })).toBe(13);
});

test("switching professions uses the matching setup and invalid choices are unavailable", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/templates/journeys?journey=contractor");
  await page.getByRole("navigation", { name: "Choose a Mega-Mix" }).getByRole("link", { name: /Recruiter/ }).click();
  await expect(page.getByRole("heading", { name: "Recruiter Mega-Mix" })).toBeVisible();
  await page.getByRole("button", { name: "Review my setup", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add Recruiter Mega-Mix" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Candidate conversation", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hiring client conversation", exact: true })).toBeVisible();
  await page.goto("/templates/journeys?journey=unknown");
  await expect(page.getByRole("button", { name: /Add .* Mega-Mix/ })).toHaveCount(0);
  expect(await prisma.mix.count({ where: { workspaceId } })).toBe(0);
});
