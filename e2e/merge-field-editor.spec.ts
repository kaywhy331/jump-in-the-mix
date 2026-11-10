import { createHash, randomUUID } from "node:crypto";
import { mkdir, appendFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { axeInPage } from "./axe-in-page";

const original = "  Hi {{First Name}},\r\nYour {{contact.custom.policy_number}}.\n{{SMS Signature}}\t ";
const output = ".artifacts/uxa08";
const sizes = [...[320,390,767,768,834,900,901,1099,1100,1194,1199,1200,1279,1280,1440,1599,1600,1699,1700,1920,2560,3840].map(width => [width, 844]), [844,390], [1280,600]];
let userId: string, workspaceId: string, mixId: string;
test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Disposable local database only");
test.use({ screenshot: "off", video: "off", trace: "off", serviceWorkers: "block" });
test.beforeEach(async ({ context }) => {
  userId = (await prisma.user.create({ data: { name: "Casey Example", email: `fields-${randomUUID()}@example.test`, emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, name: "Field fixture", slug: randomUUID(), members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.userPreference.create({ data: { userId, timezone: "UTC" } });
  const token = randomUUID();
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) } });
  await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, sameSite: "Lax" }]);
  await prisma.contactCustomFieldDefinition.create({ data: { workspaceId, key: "policy_number", name: "Policy number" } });
  const template = await prisma.stepTemplate.create({ data: { workspaceId, name: "Check in", channel: "SMS", isActive: false, versions: { create: { version: 1, body: original, variants: { create: [{ family: "EMAIL", subject: "  For {{First Name}}  ", body: original }, { family: "CALL", script: original }] } } } }, include: { versions: true } });
  mixId = (await prisma.mix.create({ data: { workspaceId, name: "Field check-in", status: "DRAFT", triggerMode: "MANUAL_START", steps: { create: { stepVersionId: template.versions[0].id, dayOffset: 0, sortOrder: 1 } } } })).id;
  await mkdir(output, { recursive: true });
});
test.afterEach(async () => {
  await prisma.workspace.deleteMany({ where: { id: workspaceId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});
async function open(page: Page) {
  await page.goto(`/mixes?mix=${mixId}&view=edit`);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toBeEditable();
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
}
const stored = () => prisma.mix.findUniqueOrThrow({ where: { id: mixId }, include: { steps: { include: { stepVersion: { include: { variants: true } } } } } });

test("unchanged save preserves the whole Mix and field insertion preserves exact tokens", async ({ page }) => {
  await open(page);
  const before = await stored();
  const message = page.getByRole("textbox", { name: "Message", exact: true });
  await expect(message.locator(".merge-field-chip")).toHaveText(["First Name", "Policy number", "SMS Signature"]);
  await expect(message).not.toContainText("{{");
  await page.getByRole("button", { name: "Save Mix", exact: true }).click();
  expect(await stored()).toEqual(before);
  await expect(page.locator(".form-guard-status")).toHaveText("");
  await message.focus(); await page.keyboard.press("Control+End");
  await page.getByRole("button", { name: "Insert field", exact: true }).first().click();
  await page.getByRole("dialog", { name: "Insert field" }).getByRole("button", { name: "First Name", exact: true }).click();
  await expect(page.locator('input[name="inlineBody-0"]')).toHaveValue(original + "{{First Name}}");
  await page.keyboard.press("Control+z");
  await expect(page.locator('input[name="inlineBody-0"]')).toHaveValue(original);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator('input[name="inlineBody-0"]')).toHaveValue(original + "{{First Name}}");
  await page.getByRole("button", { name: "Save Mix", exact: true }).click();
  await expect(page).toHaveURL(/updated=manual/);
  expect((await stored()).steps[0].stepVersion.body).toBe(original + "{{First Name}}");
  const variants = (await stored()).steps[0].stepVersion.variants;
  expect(variants.find(variant => variant.family === "EMAIL")).toMatchObject({ subject: "  For {{First Name}}  ", body: original });
  expect(variants.find(variant => variant.family === "CALL")).toMatchObject({ script: original });
  await page.goto(`/mixes?mix=${mixId}`);
  await expect(page.locator(".mix-beat-preview .merge-field-chip").first()).toHaveText("First Name");
});

test("create validates, retains failed saves, and supports typed fields and alternate wording", async ({ page }) => {
  await page.goto("/mixes/new?custom=1");
  await page.getByLabel("Mix name", { exact: true }).fill("Created with fields");
  await page.getByRole("combobox", { name: "When should it start?", exact: true }).selectOption("MANUAL_START");
  const message = page.getByRole("textbox", { name: "Message", exact: true });
  await page.getByRole("button", { name: "Create a Mix" }).click();
  await expect(message).toHaveAttribute("aria-invalid", "true");
  await expect(message).toBeFocused();
  await message.fill("Hi {{First Name}},\nA café visit? {{SMS Signature}}");
  await expect(message.locator(".merge-field-chip")).toHaveCount(2);
  await expect(page.locator('input[name="inlineBody-0"]')).toHaveValue("Hi {{First Name}},\nA café visit? {{SMS Signature}}");
  await page.getByLabel("Options for Beat 1").click();
  await page.locator("[data-beat-alternatives] > summary").click();
  await page.getByRole("textbox", { name: "Email version subject (optional)", exact: true }).fill("For {{First Name}}");
  await page.getByRole("textbox", { name: "Email version (optional)", exact: true }).fill("Hello {{First Name}}. {{Email Signature}}");
  await page.getByRole("textbox", { name: "Call version · talking points for you (optional)", exact: true }).fill("Ask {{First Name}} about {{Private Notes}}");
  await page.route("**/*", route => route.request().headers()["next-action"] ? route.abort("internetdisconnected") : route.continue());
  await page.getByRole("button", { name: "Create a Mix" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Your entries are kept" })).toBeVisible();
  await expect(message).toContainText("A café visit?");
  await page.unroute("**/*");
  await page.getByRole("button", { name: "Create a Mix" }).click();
  await expect(page).toHaveURL(/created=manual/);
  expect((await prisma.mix.findFirstOrThrow({ where: { workspaceId, name: "Created with fields" }, include: { steps: { include: { stepVersion: true } } } })).steps[0].stepVersion.body).toBe("Hi {{First Name}},\nA café visit? {{SMS Signature}}");
});

test("custom fields hide syntax, copy the stable key, and keep the key after rename", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/contacts/custom-fields");
  const row = page.locator(".custom-field-row");
  await expect(row).not.toContainText("{{");
  await expect(row.locator(".merge-field-chip")).toHaveText("Policy number");
  await row.getByRole("button", { name: "Copy key for Policy number" }).click();
  await expect(row.getByRole("status")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("{{contact.custom.policy_number}}");
  await row.getByRole("button", { name: "Rename", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Rename Policy number" });
  await dialog.getByLabel("Name", { exact: true }).fill("Renewal number");
  await dialog.getByRole("button", { name: "Save name" }).click();
  await expect(page).toHaveURL(/updated=1/);
  await expect(row.locator(".merge-field-chip")).toHaveText("Renewal number");
  expect((await prisma.contactCustomFieldDefinition.findFirstOrThrow({ where: { workspaceId } })).key).toBe("policy_number");
  await open(page);
  await expect(page.getByRole("textbox", { name: "Message", exact: true })).toContainText("Renewal number");
});

test("insertion replaces a selection, clipboard keeps tokens, and deleting a chip is atomic", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  const message = page.getByRole("textbox", { name: "Message", exact: true });
  const value = page.locator('input[name="inlineBody-0"]');
  await message.fill("Before selected after");
  await message.evaluate(element => {
    const range = document.createRange(); range.setStart(element.firstChild!, 7); range.setEnd(element.firstChild!, 15);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  });
  await page.getByRole("button", { name: "Insert field", exact: true }).first().click();
  await page.getByRole("dialog", { name: "Insert field" }).getByRole("button", { name: "First Name", exact: true }).click();
  await expect(value).toHaveValue("Before {{First Name}} after");
  await expect(message).toBeFocused();
  await page.keyboard.press("Backspace");
  await expect(value).toHaveValue("Before  after");
  await page.keyboard.press("Control+z");
  await expect(value).toHaveValue("Before {{First Name}} after");
  await page.keyboard.press("Control+a"); await page.keyboard.press("Control+c");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("Before {{First Name}} after");
  await page.evaluate(() => navigator.clipboard.writeText('<img src=x>\n{{First Name}}\n\nLast line'));
  await page.keyboard.press("Control+v");
  await expect(value).toHaveValue('<img src=x>\n{{First Name}}\n\nLast line');
  await expect(message.locator("img")).toHaveCount(0);
  await expect(message.locator(".merge-field-chip")).toHaveText("First Name");
});

test("both themes, full width matrix, short height, keyboard and enlarged text", async ({ page }, info) => {
  test.setTimeout(240000);
  await open(page);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => { localStorage.setItem("jitm-appearance", theme); document.documentElement.dataset.theme = theme; }, theme);
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      const bar = page.locator(".mix-editor-form > .save-bar");
      await bar.scrollIntoViewIfNeeded();
      const metrics = await page.evaluate(() => {
        const bar = document.querySelector(".mix-editor-form > .save-bar")!;
        return { overflow: document.documentElement.scrollWidth > innerWidth, position: getComputedStyle(bar).position, barHeight: bar.getBoundingClientRect().height };
      });
      expect(metrics.overflow, `${theme} ${width}x${height}`).toBe(false);
      expect(metrics.position).toBe(width <= 900 || height <= 480 ? "static" : "sticky");
      await page.screenshot({ path: `${output}/${info.project.name}-${theme}-${width}x${height}.png` });
      await appendFile(`${output}/matrix.jsonl`, JSON.stringify({ project: info.project.name, theme, width, height, ...metrics }) + "\n");
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await expect(page.getByRole("button", { name: "Save Mix", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${output}/${info.project.name}-${theme}-200text.png` });
    const message = page.getByRole("textbox", { name: "Message", exact: true });
    await message.focus(); await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Insert field", exact: true }).first()).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Insert field" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Insert field", exact: true }).first()).toBeFocused();
    expect((await axeInPage(page).include(".mix-editor-form").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    await page.locator("style").filter({ hasText: "font-size: 200%" }).evaluateAll(nodes => nodes.forEach(node => node.remove()));
    await page.setViewportSize({ width: 1199, height: 844 });
    await page.evaluate(() => { document.documentElement.style.zoom = "1.1"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${output}/${info.project.name}-${theme}-110zoom.png` });
    await page.evaluate(() => { document.documentElement.style.zoom = ""; });
  }
});

test("custom fields in both themes, width matrix and enlarged text", async ({ page }, info) => {
  test.setTimeout(240000);
  await page.goto("/contacts/custom-fields");
  const row = page.locator(".custom-field-row");
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => { localStorage.setItem("jitm-appearance", theme); document.documentElement.dataset.theme = theme; }, theme);
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await row.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${width}x${height}`).toBe(true);
      await expect(row).not.toContainText("{{");
      const button = row.getByRole("button", { name: "Copy key for Policy number" });
      const bounds = await button.boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(44); expect(bounds!.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: `${output}/custom-${info.project.name}-${theme}-${width}x${height}.png` });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const enlarged = await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await axeInPage(page).include("main").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `${output}/custom-${info.project.name}-${theme}-200text.png` });
    await enlarged.evaluate(node => node.parentNode?.removeChild(node));
  }
});
