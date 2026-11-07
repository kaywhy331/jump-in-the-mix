import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { DEFAULT_AUTOMATIC_DELIVERY_WINDOW } from "../src/lib/automatic-delivery-window-options";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";

test.use({ serviceWorkers: "block" });
let bundle: string, css: string;
test.beforeAll(async () => {
  const result = await build({ entryPoints: [resolve("e2e/fixtures/sending-settings.tsx")], outfile: "sending-fixture.js", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" } });
  bundle = result.outputFiles.find(file => file.path.endsWith(".js"))!.text;
  css = result.outputFiles.find(file => file.path.endsWith(".css"))!.text;
  // Match the real root layout's local UI family, which Next normally injects.
  for (const [index, weight] of [400, 500, 600, 700].entries()) {
    const font = await readFile(resolve(`src/app/fonts/instrument-sans${index ? `-${index}` : ""}.ttf`));
    css += `@font-face{font-family:uiFont;src:url(data:font/ttf;base64,${font.toString("base64")});font-weight:${weight};}`;
  }
  css += ":root{--font-instrument:uiFont;}";
});
test.beforeEach(async ({ page }) => {
  await page.route("**/__sending-settings?*", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sending fixture</title><style>${css}</style></head><body><div id="root"></div><script>${bundle}</script></body></html>` }));
  await page.route("**/api/settings/sending-preview?*", route => route.fulfill({ json: { count: 1, page: 1, pages: 1, timezone: "UTC", observedAt: "2026-10-28T12:00:00Z", items: [{ id: "synthetic-follow-up", name: "Casey Example", reason: "Estimate follow-up", channel: "EMAIL", recipient: "casey@example.test", earliestAt: null, blockedReason: "Automatic email is unavailable" }] } }));
});
async function open(page: Page, query: string) {
  await page.goto(`/__sending-settings?${query}`);
  await expect(page.locator("[data-ready]")).toHaveAttribute("data-ready", "true");
  await page.evaluate(async () => {
    await Promise.all([400, 500, 600, 700].map(weight => document.fonts.load(`${weight} 16px uiFont`)));
    await document.fonts.ready;
  });
  const fonts = await page.evaluate(() => ({
    family: getComputedStyle(document.querySelector("h1")!).fontFamily,
    loaded: [400, 500, 600, 700].map(weight => document.fonts.check(`${weight} 16px uiFont`)),
    faces: [...document.fonts].filter(face => face.family === "uiFont").map(face => face.status)
  }));
  expect(fonts.family).toContain("uiFont");
  expect(fonts.loaded).toEqual([true, true, true, true]);
  expect(fonts.faces).toHaveLength(4);
  expect(fonts.faces.every(status => status === "loaded")).toBe(true);
}
async function disclose(page: Page, label: string) {
  const summary = page.locator("summary").filter({ hasText: label });
  await summary.focus();
  await expect(summary).toBeFocused();
  expect(await summary.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Preview affected messages" })).toBeVisible();
}

for (const theme of ["light", "dark"]) {
  test(`${theme}: real Sending page previews an unlisted window and preserves it when disabled`, async ({ page }, testInfo) => {
    const database = new URL(process.env.DATABASE_URL!);
    expect(["localhost", "127.0.0.1"]).toContain(database.hostname);
    expect(database.pathname).toMatch(/^\/jitm_design_/);
    const id = randomUUID();
    const user = await prisma.user.create({ data: { name: "Sending Owner", email: `sending-${id}@example.test`, emailVerifiedAt: new Date() } });
    try {
      const workspace = await prisma.workspace.create({ data: {
        name: "Sending fixture", slug: id, ownerId: user.id, members: { create: { userId: user.id } },
        profile: { create: { onboardingDone: true } },
        automationPreference: { create: { enabled: true, emailEnabled: true, smsEnabled: true, reviewWindowMinutes: 45 } }
      } });
      const token = randomBytes(32).toString("base64url");
      await prisma.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
      await page.context().addCookies([{ name: "jitm_session", value: token, url: process.env.PLAYWRIGHT_BASE_URL!, httpOnly: true, sameSite: "Strict" }]);
      await page.unroute("**/api/settings/sending-preview?*");
      await page.goto("/settings/sending");
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await expect(page.getByRole("heading", { name: "Sending to customers", exact: true })).toBeVisible();
      const summary = page.locator(".automation-settings-card summary");
      await summary.focus();
      await expect(summary).toBeFocused();
      expect(await summary.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe("none");
      await page.keyboard.press("Enter");
      const preview = page.waitForResponse(response => response.url().includes("/api/settings/sending-preview?"));
      await page.getByRole("button", { name: "Preview affected messages" }).click();
      const response = await preview;
      expect(response.status()).toBe(200);
      expect(new URL(response.url()).searchParams.get("minutes")).toBe(String(DEFAULT_AUTOMATIC_DELIVERY_WINDOW));
      await expect(page.locator('p[role="status"]')).toContainText("0 pending candidates");
      const off = page.getByRole("button", { name: "Turn off automatic sending" });
      for (const textSize of [100, 200]) {
        await page.addStyleTag({ content: `html { font-size: ${textSize}% !important; }` });
        for (const width of [320, 390, 768, 901, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
          await off.scrollIntoViewIfNeeded();
          await off.focus();
          await expect(off).toBeFocused();
          const bounds = await off.boundingBox();
          expect(bounds!.height).toBeGreaterThanOrEqual(44);
          expect(bounds!.x).toBeGreaterThanOrEqual(0);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
          await page.screenshot({ path: testInfo.outputPath(`real-${theme}-${width}-${textSize}.png`), fullPage: true });
        }
      }
      expect((await new AxeBuilder({ page }).include(".sending-settings-page").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
      await off.click();
      await expect(page.getByText("Sending preferences saved.", { exact: true })).toBeVisible();
      expect(await prisma.automationPreference.findUnique({ where: { workspaceId: workspace.id } })).toMatchObject({ enabled: false, emailEnabled: false, smsEnabled: false, reviewWindowMinutes: 45 });
    } finally {
      await prisma.workspace.deleteMany({ where: { ownerId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
  for (const email of [0, 1]) {
    test(`${theme}: unlisted saved window previews the default and turn-off preserves it; email=${email}`, async ({ page }) => {
      await open(page, `theme=${theme}&email=${email}&on=1&emailSaved=1&minutes=45`);
      await expect(page.getByRole("heading", { name: email ? "Automatic sending is on" : "Nothing can send automatically (saved setting: On)", exact: true })).toBeVisible();
      await disclose(page, email ? "Configure automatic sending" : "Automatic sending details");
      const request = page.waitForRequest(request => request.url().includes("/sending-preview?"));
      await page.getByRole("button", { name: "Preview affected messages" }).click();
      expect(new URL((await request).url()).searchParams.get("minutes")).toBe(String(DEFAULT_AUTOMATIC_DELIVERY_WINDOW));
      await expect(page.locator('p[role="status"]')).toContainText("1 pending candidates");
      await page.getByRole("button", { name: "Turn off automatic sending" }).click();
      await expect(page.locator("[data-saved]")).toHaveText('{"reviewWindowMinutes":"45"}');
    });
  }
  test(`${theme}: saved on with no channels says nothing can send`, async ({ page }) => {
    await open(page, `theme=${theme}&email=1&on=1`);
    await expect(page.getByRole("heading", { name: "Nothing can send automatically (saved setting: On)", exact: true })).toBeVisible();
    await expect(page.getByText("On · No channels selected", { exact: true })).toBeVisible();
  });
  for (const on of [0, 1]) {
    test(`${theme}: unavailable saved ${on ? "on" : "off"} stays concise, previews and can turn off`, async ({ page }) => {
      await open(page, `theme=${theme}&on=${on}&emailSaved=1&smsSaved=1`);
      await expect(page.getByText(on ? "On · Unavailable" : "Off", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Send prepared messages automatically", { exact: false })).toHaveCount(0);
      await expect(page.locator("input[required]")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Preview affected messages" })).toBeHidden();
      await disclose(page, "Automatic sending details");
      const request = page.waitForRequest(request => request.url().includes("/sending-preview?"));
      await page.getByRole("button", { name: "Preview affected messages" }).click();
      const url = new URL((await request).url());
      expect(url.searchParams.get("email")).toBe("1");
      expect(url.searchParams.get("sms")).toBe("1");
      await expect(page.locator('p[role="status"]')).toContainText("1 pending candidates");
      await expect(page.getByText("Will not send:", { exact: false })).toBeVisible();
      if (on) {
        await page.getByRole("button", { name: "Turn off automatic sending" }).click();
        await expect(page.locator("[data-saved]")).toHaveText('{"reviewWindowMinutes":"30"}');
      }
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    });
  }
  for (const capabilities of ["10", "01", "11"]) {
    test(`${theme}: ${capabilities} explicitly reveals setup and retains preview, review and consent`, async ({ page }) => {
      await open(page, `theme=${theme}&email=${capabilities[0]}&sms=${capabilities[1]}`);
      const save = page.getByRole("button", { name: "Save automatic sending", includeHidden: true });
      await expect(save).toBeHidden();
      await disclose(page, "Configure automatic sending");
      await page.getByLabel("Send prepared messages automatically", { exact: false }).check();
      const email = page.locator('[name="automationEmailEnabled"]');
      const sms = page.locator('[name="automationSmsEnabled"]');
      if (capabilities[0] === "0") await expect(email).toBeDisabled(); else await expect(email).toBeEnabled();
      if (capabilities[1] === "0") await expect(sms).toBeDisabled(); else await expect(sms).toBeEnabled();
      await (capabilities[0] === "1" ? email : sms).check();
      await page.getByLabel("Time to review before sending", { exact: false }).selectOption("60");
      const reviewed = page.getByRole("checkbox", { name: "I reviewed the proposed queue.", exact: false });
      await expect(reviewed).toBeVisible();
      await save.click();
      await expect(reviewed).toBeFocused();
      await expect(page.locator("[data-saved]")).toBeEmpty();
      await page.getByLabel("I understand these messages send without a final tap", { exact: false }).check();
      await page.getByRole("button", { name: "Preview affected messages" }).click();
      await expect(page.locator('p[role="status"]')).toContainText("1 pending candidates");
      await reviewed.check();
      // Closing preserves edits; invalid controls reopen the disclosure before validation focuses them.
      await reviewed.uncheck();
      await page.locator("summary").click();
      await save.evaluate(button => (button as HTMLButtonElement).form!.requestSubmit());
      await expect(reviewed).toBeVisible();
      await expect(reviewed).toBeFocused();
      await expect(page.locator('[name="reviewWindowMinutes"]')).toHaveValue("60");
      await reviewed.check();
      await save.click();
      await expect(page.locator("[data-saved]")).toContainText('"automationConsent":"on"');
      await expect(page.locator("[data-saved]")).toContainText('"reviewWindowMinutes":"60"');
      expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    });
  }
  test(`${theme}: view-only available preview works with both saves disabled`, async ({ page }) => {
    await open(page, `theme=${theme}&email=1&on=1&emailSaved=1&smsSaved=1&viewOnly=1`);
    await expect(page.getByText("On · Some channels unavailable")).toBeVisible();
    await expect(page.getByRole("button", { name: "Turn off automatic sending" })).toBeDisabled();
    await disclose(page, "Configure automatic sending");
    await expect(page.getByRole("button", { name: "Save automatic sending" })).toBeDisabled();
    await page.getByRole("button", { name: "Preview affected messages" }).click();
    await expect(page.locator('p[role="status"]')).toContainText("1 pending candidates");
    await expect(page.locator("[data-saved]")).toBeEmpty();
  });
  test(`${theme}: saved-on can turn off with configuration collapsed and review unconfirmed`, async ({ page }) => {
    await open(page, `theme=${theme}&email=1&on=1&emailSaved=1`);
    await expect(page.getByRole("button", { name: "Save automatic sending" })).toBeHidden();
    await page.getByRole("button", { name: "Turn off automatic sending" }).click();
    await expect(page.locator("[data-saved]")).toHaveText('{"reviewWindowMinutes":"30"}');
  });
  test(`${theme}: available setup reflows at 200 percent text`, async ({ page }, testInfo) => {
    await open(page, `theme=${theme}&email=1&sms=1`);
    await disclose(page, "Configure automatic sending");
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    for (const width of [320, 390, 767, 768, 834, 900, 901, 1199, 1200, 1279, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
      const save = page.getByRole("button", { name: "Save automatic sending", includeHidden: true });
      await save.scrollIntoViewIfNeeded();
      await save.focus();
      await expect(save).toBeFocused();
      const bounds = await save.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      const labels = await page.locator(".sending-options .checkbox-card").evaluateAll(cards => cards.map(card => {
        const title = card.querySelector("strong")!.getBoundingClientRect();
        const help = card.querySelector("small")!.getBoundingClientRect();
        return { titleBottom: title.bottom, helpTop: help.top, right: Math.max(title.right, help.right),
          scroll: card.scrollWidth, client: card.clientWidth };
      }));
      for (const label of labels) {
        expect(label.helpTop).toBeGreaterThanOrEqual(label.titleBottom);
        expect(label.right).toBeLessThanOrEqual(width + 1);
        expect(label.scroll).toBeLessThanOrEqual(label.client + 1);
      }
      await testInfo.attach(`geometry-${theme}-${width}`, { body: JSON.stringify({ width, save: bounds, labels }), contentType: "application/json" });
      await page.screenshot({ path: testInfo.outputPath(`setup-${theme}-${width}-200.png`), fullPage: true });
    }
  });
}
