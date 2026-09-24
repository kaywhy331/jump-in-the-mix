import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { test, expect, type BrowserContext } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { installMegaMix } from "../src/lib/mega-mix-service";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Requires isolated local fixtures.");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block", actionTimeout: 15_000 });
test.setTimeout(240_000);
const dir = ".artifacts/market-20260924/e2e";
const owners: Array<{ userId: string; workspaceId: string }> = [];
const errors: string[] = [];

async function owner(context: BrowserContext, label: string) {
  const userId = (await prisma.user.create({ data: { name: label, email: `pipelines-${randomUUID()}@example.invalid`, emailVerifiedAt: new Date() } })).id;
  const workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: label, slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  const token = randomUUID();
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  await context.clearCookies();
  await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Strict" }]);
  owners.push({ userId, workspaceId });
  return { userId, workspaceId };
}
test.beforeEach(async ({ page }) => { errors.length = 0; page.on("pageerror", error => errors.push(error.message)); await mkdir(dir, { recursive: true }); });
test.afterEach(async () => {
  await prisma.workspace.deleteMany({ where: { id: { in: owners.map(item => item.workspaceId) } } });
  await prisma.user.deleteMany({ where: { id: { in: owners.map(item => item.userId) } } });
  owners.length = 0;
  expect(errors).toEqual([]);
});

test("name a Mega-Mix, switch Journey to it, export it and import the file into another account", async ({ page, context }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const first = await owner(context, "Pipeline author");
  const installed = await installMegaMix({ workspaceId: first.workspaceId, actorUserId: first.userId, blueprintId: "contractor", expectedVersion: 1 });
  const loose = await prisma.mix.create({ data: { workspaceId: first.workspaceId, name: "Birthday hello", triggerMode: "MANUAL_START", status: "ACTIVE" } });

  // The ready-made install is already a named Mega-Mix with numbered Beats.
  await page.goto("/mixes/mega");
  await expect(page.getByRole("heading", { name: "Contractor", exact: true })).toBeVisible();
  const outline = page.getByRole("list", { name: "Contractor Beats in journey order" });
  await expect(outline.getByTitle("Beat 1", { exact: true })).toBeVisible();
  await expect(outline).toContainText("Site visit agreed → 3a–4a · Site visit follow-through");
  await expect(page.getByText("1 Mix is not in a Mega-Mix")).toBeVisible();
  // A Mix without Beats is listed but left out of the file, and the page says so.

  // Rename and add the loose Mix.
  await page.getByRole("link", { name: "Edit", exact: true }).click();
  await page.getByRole("textbox", { name: "Mega-Mix name" }).fill("Kitchen remodels");
  await page.getByRole("checkbox", { name: /Birthday hello/ }).check();
  await page.getByRole("button", { name: "Save Mega-Mix", exact: true }).click();
  await expect(page.getByText("Mega-Mix saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kitchen remodels", exact: true })).toBeVisible();
  expect(await prisma.megaMixPipelineMix.findUnique({ where: { mixId: loose.id } })).toMatchObject({ pipelineId: installed.id });

  // Journey shows one Mega-Mix at a time and remembers it in the address.
  await page.getByRole("link", { name: "Open in Journey", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Show Mega-Mix" })).toHaveValue(installed.id);
  await page.getByRole("combobox", { name: "Show Mega-Mix" }).selectOption("none");
  await expect(page.getByRole("heading", { name: "No Mixes in this view" })).toBeVisible();
  await expect(page).toHaveURL(/megaMix=none/);
  await page.getByRole("button", { name: "Show all Mixes", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Show Mega-Mix" })).toHaveValue("");

  // Export downloads a file without people or ids.
  await page.goto(`/mixes/mega?megaMix=${installed.id}`);
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export file", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("kitchen-remodels.megamix.json");
  const path = `${dir}/kitchen-remodels.megamix.json`; await file.saveAs(path);
  const text = await readFile(path, "utf8");
  expect(JSON.parse(text)).toMatchObject({ format: "jump-in-the-mix", kind: "mega-mix", name: "Kitchen remodels" });
  expect(JSON.parse(text).mixes).toHaveLength(13);
  await expect(page.getByText(/1 Mix has no Beats or a fixed-date start/)).toBeVisible();
  expect(text).not.toContain(first.workspaceId); expect(text).not.toContain(installed.id);

  // Another account imports the file after reviewing it.
  const second = await owner(context, "Pipeline importer");
  await page.goto("/mixes/mega");
  await page.getByRole("button", { name: "Import a Mix or Mega-Mix file" }).click();
  await page.getByLabel("Mix or Mega-Mix file", { exact: true }).setInputFiles(path);
  await expect(page.getByRole("status").filter({ hasText: "A Mega-Mix: 13 Mixes · 24 Beats" })).toBeVisible();
  await page.screenshot({ path: `${dir}/import-preview-1920.png` });
  await page.getByRole("textbox", { name: "Mega-Mix name" }).fill("Remodel pipeline");
  await page.getByRole("checkbox", { name: /I’ve reviewed the wording/ }).check();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText(/Imported\. No one was started/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Remodel pipeline", exact: true })).toBeVisible();
  expect(await prisma.mix.count({ where: { workspaceId: second.workspaceId } })).toBe(13);
  expect(await prisma.mixWorkflowInstance.count({ where: { workspaceId: second.workspaceId } })).toBe(0);

  // Duplicate, then remove the copy; its Mixes stay.
  await page.getByText("Manage Mega-Mix").click();
  await page.getByRole("textbox", { name: "Name for the copy" }).fill("Remodel pipeline B");
  await page.getByRole("button", { name: "Make a copy", exact: true }).click();
  await expect(page.getByText(/Copy ready/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Remodel pipeline B", exact: true })).toBeVisible();
  expect(await prisma.mix.count({ where: { workspaceId: second.workspaceId } })).toBe(26);
  await page.getByText("Manage Mega-Mix").click();
  await page.getByRole("button", { name: "Remove Mega-Mix", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove Mega-Mix", exact: true }).click();
  await expect(page.getByText(/Mega-Mix removed/)).toBeVisible();
  expect(await prisma.mix.count({ where: { workspaceId: second.workspaceId } })).toBe(26);
  const exported = await (await page.request.get("/api/account/export")).json();
  expect(exported.megaMixPipelines).toHaveLength(1);
});

test("a file that is not a Jump in the Mix export is refused and nothing is added", async ({ page, context }) => {
  const account = await owner(context, "Pipeline refusal");
  await page.goto("/mixes/mega");
  await page.getByRole("button", { name: "Import a Mix or Mega-Mix file" }).click();
  await page.getByLabel("Mix or Mega-Mix file", { exact: true }).setInputFiles({ name: "notes.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ hello: "world" })) });
  await expect(page.getByRole("alert").filter({ hasText: "This is not a Jump in the Mix file" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import", exact: true })).toHaveCount(0);
  expect(await prisma.mix.count({ where: { workspaceId: account.workspaceId } })).toBe(0);
});

test("Mega-Mixes reflow in both themes, work by keyboard and pass accessibility checks", async ({ page, context }) => {
  const account = await owner(context, "Pipeline layout");
  await installMegaMix({ workspaceId: account.workspaceId, actorUserId: account.userId, blueprintId: "contractor", expectedVersion: 1 });
  await page.goto("/mixes/mega");
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => { localStorage.setItem("jitm-appearance", theme); document.documentElement.dataset.theme = theme; }, theme);
    for (const width of [320, 390, 834, 1440, 1920]) {
      await page.setViewportSize({ width, height: width > 1000 ? 1000 : 844 });
      if (width < 1200) await page.getByRole("navigation", { name: "Mix workspace panels" }).getByRole("button", { name: "Beats" }).click();
      await expect(page.getByRole("list", { name: "Contractor Beats in journey order" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
      await page.screenshot({ path: `${dir}/mega-${width}-${theme}.png` });
      expect((await axeInPage(page).include(".mix-workspace-page").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
      if (width < 1200) await page.getByRole("navigation", { name: "Mix workspace panels" }).getByRole("button", { name: "Mixes" }).click();
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/mixes/mega?new=1");
  await page.getByRole("textbox", { name: "Mega-Mix name" }).focus();
  await page.keyboard.type("Keyboard pipeline");
  await page.keyboard.press("Tab"); await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await expect(page.getByText(/moves here from Contractor/)).toBeVisible();
  expect((await axeInPage(page).include(".mix-workspace-page").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Create Mega-Mix", exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "Keyboard pipeline", exact: true })).toBeVisible();
});
