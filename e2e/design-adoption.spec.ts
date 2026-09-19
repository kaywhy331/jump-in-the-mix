import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("appearance persists, overrides the system, and follows it again", async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const appearance = page.getByLabel("Appearance", { exact: true });
  await expect(page.locator("body")).toHaveCSS("color", "rgb(238, 237, 246)");
  await appearance.selectOption("light");
  await expect(page.locator("body")).toHaveCSS("color", "rgb(26, 24, 48)");
  await page.reload();
  await expect(appearance).toHaveValue("light");
  await expect(page.locator("body")).toHaveCSS("color", "rgb(26, 24, 48)");
  const other = await context.newPage();
  await other.goto("/faq");
  await expect(other.getByLabel("Appearance", { exact: true })).toHaveValue("light");
  await appearance.selectOption("dark");
  await expect(other.getByLabel("Appearance", { exact: true })).toHaveValue("dark");
  await appearance.selectOption("system");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("body")).toHaveCSS("color", "rgb(26, 24, 48)");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveCSS("color", "rgb(238, 237, 246)");
  await other.close();
});

test("blocked storage still permits changing appearance for this visit", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Blocked", "SecurityError"); } }));
  await page.goto("/");
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await expect(page.locator("body")).toHaveCSS("color", "rgb(238, 237, 246)");
  await expect(page.getByText("Applied for this visit. This browser could not remember your choice.")).toBeVisible();
});

test("the demo uses the two design fonts and stays accessible through all steps", async ({ page }) => {
  await page.goto("/");
  await page.locator("#sample textarea").fill("Hi Alex, is Tuesday still a good time to catch up?");
  expect(await page.locator("#sample textarea").evaluate(element => getComputedStyle(element).fontFamily)).toMatch(/newsreader/i);
  await page.getByRole("button", { name: "Preview message", exact: true }).click();
  await expect(page.locator("#sample blockquote")).toContainText("Tuesday");
  await page.getByRole("button", { name: "Choose next step" }).click();
  await page.getByRole("button", { name: "Finish practice" }).click();
  await expect(page.locator("#sample")).toContainText("Nothing was sent or scheduled");
  expect((await new AxeBuilder({ page }).include("#sample").analyze()).violations).toEqual([]);
});

test("desktop review has usable space and retains its draft when resized", async ({ page }) => {
  test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Disposable local database only");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("demo@jumpinthemix.local");
  await page.getByLabel("Password", { exact: true }).fill("JumpInTheMix123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/jumps/);
  const panel = page.locator(".follow-up-review-sheet[open]");
  await expect(panel).toBeVisible();
  const field = panel.getByRole("textbox", { name: "Your message", exact: true });
  await expect(field).toBeEnabled();
  // Hover must not make the row a new positioning container for its docked editor.
  await page.locator(".jump-task-card:has(.follow-up-review-sheet[open]) .jump-card-heading h3").hover();
  const bounds = await field.boundingBox();
  expect(bounds!.width).toBeGreaterThan(400);
  expect(bounds!.y).toBeGreaterThan(0);
  const original = await field.inputValue();
  await field.fill(`${original} Browser layout check.`);
  await page.setViewportSize({ width: 1194, height: 834 });
  await expect.poll(() => panel.evaluate(element => element.matches(":modal"))).toBe(false);
  expect((await field.boundingBox())!.width).toBeGreaterThan(400);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(field).toHaveValue(`${original} Browser layout check.`);
  await expect.poll(() => panel.evaluate(element => element.matches(":modal"))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await field.fill(original);
  await page.waitForTimeout(1000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(field).toHaveValue(original);
  await expect.poll(() => panel.evaluate(element => element.matches(":modal"))).toBe(false);
});
