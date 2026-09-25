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
  const signIn = await context.newPage();
  await signIn.goto("/login");
  await expect(signIn.locator("body")).toHaveCSS("color", "rgb(26, 24, 48)");
  await appearance.selectOption("dark");
  await expect(other.getByLabel("Appearance", { exact: true })).toHaveValue("dark");
  await expect(signIn.locator("body")).toHaveCSS("color", "rgb(238, 237, 246)");
  await appearance.selectOption("system");
  await expect(signIn.locator("html")).not.toHaveAttribute("data-theme");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("body")).toHaveCSS("color", "rgb(26, 24, 48)");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("body")).toHaveCSS("color", "rgb(238, 237, 246)");
  await other.close();
  await signIn.close();
});

test("blocked storage still permits changing appearance for this visit", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Blocked", "SecurityError"); } }));
  await page.goto("/");
  await page.getByLabel("Appearance", { exact: true }).selectOption("dark");
  await expect(page.locator("body")).toHaveCSS("color", "rgb(238, 237, 246)");
  await expect(page.getByText("Applied for this visit. This browser could not remember your choice.")).toBeVisible();
});

test("account deletion confirmation uses the shared centered auth layout", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/account/deleted");
  const card = await page.locator(".auth-card").boundingBox();
  expect(card!.width).toBeLessThan(600);
  expect(Math.abs(card!.x + card!.width / 2 - 960)).toBeLessThan(2);
  expect(card!.y).toBeGreaterThan(100);
  await expect(page.getByRole("link", { name: "Return home" })).toBeVisible();
});

test("narrow journey controls and wide preference fields stay aligned", async ({ page }) => {
  test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Disposable local database only");
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("demo@jumpinthemix.local");
  await page.getByLabel("Password", { exact: true }).fill("JumpInTheMix123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/jumps/);
  // The stage map with its roster and "Find someone" dialog was retired (6c8927d, e40d4b8); Journey is now a
  // three-pane workspace whose People pane holds the person search and roster on a narrow screen.
  await page.goto("/journey");
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
  const panes = page.getByRole("navigation", { name: "Journey workspace panels", exact: true });
  await panes.getByRole("button", { name: "People", exact: true }).click();
  const people = page.getByRole("region", { name: "Journey people", exact: true });
  const person = people.getByRole("button", { name: /^View .+'s journey$/ }).first();
  await person.waitFor();
  const workspace = await page.locator("#workspace-main").boundingBox();
  for (const control of [panes, page.getByRole("complementary", { name: "Journey directory", exact: true }), people, person, people.getByRole("link", { name: /^Open .+'s contact$/ }).first()]) {
    const bounds = await control.boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(workspace!.x + workspace!.width + 1);
  }
  const search = people.locator("form").filter({ has: page.getByRole("searchbox", { name: "Find a person", exact: true }) });
  await expect(search.getByRole("button", { name: "Search", exact: true })).toBeInViewport();
  expect((await search.boundingBox())!.width).toBeLessThanOrEqual(320);
  await page.setViewportSize({ width: 3840, height: 1100 });
  await page.goto("/account/preferences");
  const name = page.getByLabel("Display name", { exact: true });
  const locale = page.getByRole("combobox", { name: "Locale", exact: true });
  const original = await name.inputValue();
  expect(Math.abs((await name.boundingBox())!.y - (await locale.boundingBox())!.y)).toBeLessThan(2);
  await name.fill(`${original} layout check`);
  const status = page.getByRole("status").filter({ hasText: "Unsaved changes." });
  await expect(status).toBeVisible();
  expect((await status.boundingBox())!.width).toBeGreaterThan(900);
  expect(Math.abs((await name.boundingBox())!.y - (await locale.boundingBox())!.y)).toBeLessThan(2);
  await name.fill(original);
  await expect(status).toHaveCount(0);
});

test("the demo uses the two design fonts and stays accessible through all steps", async ({ page }) => {
  await page.goto("/");
  await page.locator("#sample textarea").fill("Hi Alex, is Tuesday still a good time to catch up?");
  expect(await page.locator("#sample textarea").evaluate(element => getComputedStyle(element).fontFamily)).toMatch(/newsreader/i);
  await page.getByRole("button", { name: "Preview SMS", exact: true }).click();
  await expect(page.locator("#sample blockquote")).toContainText("Tuesday");
  await page.getByRole("button", { name: "Mark sent (demo)", exact: true }).click();
  await expect(page.locator("#sample")).toContainText("Nothing was sent.");
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
  expect(bounds!.width).toBeGreaterThan(300);
  expect(bounds!.y).toBeGreaterThan(0);
  const original = await field.inputValue();
  await field.fill(`${original} Browser layout check.`);
  // A page can avoid document overflow while its queue collapses completely.
  // Measure the usable columns after the page reaches its maximum width.
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [1920, 2560, 3440, 3840]) {
      await page.setViewportSize({ width, height: 1100 });
      const queue = await page.locator(".jump-task-card").first().boundingBox();
      const editor = await panel.boundingBox();
      const workspace = await page.locator(".today-page").boundingBox();
      expect(queue!.width).toBeGreaterThanOrEqual(324);
      expect(queue!.width).toBeLessThanOrEqual(440);
      expect(editor!.x).toBeGreaterThanOrEqual(queue!.x + queue!.width + 24);
      expect(workspace!.width).toBeLessThanOrEqual(1672);
      expect((await field.boundingBox())!.width).toBeGreaterThan(300);
      expect(await field.inputValue()).toBe(`${original} Browser layout check.`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await page.setViewportSize({ width: 1194, height: 834 });
  await expect.poll(() => panel.evaluate(element => element.matches(":modal"))).toBe(false);
  expect((await field.boundingBox())!.width).toBeGreaterThan(300);
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
