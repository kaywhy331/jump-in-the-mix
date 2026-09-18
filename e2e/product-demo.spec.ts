import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("one short draft leads through preview and an honest next step without sending", async ({ page }) => {
  const mutations: string[] = [];
  page.on("request", request => { if (request.method() === "POST") mutations.push(request.url()); });
  await page.goto("/");
  await page.getByRole("link", { name: "Try the demo", exact: true }).click();
  const demo = page.locator("#sample");
  const message = demo.getByRole("textbox");
  await expect(message).toBeFocused();
  expect((await message.inputValue()).length).toBeLessThan(250);
  await message.fill("Hi Alex, would next week work for a quick check-in?");
  await expect(demo.locator(".button.primary:visible")).toHaveCount(1);
  await demo.getByRole("button", { name: "Preview message", exact: true }).click();
  await expect(demo.locator("blockquote")).toContainText("would next week work");
  await demo.getByRole("button", { name: "Back to edit" }).click();
  await expect(message).toHaveValue("Hi Alex, would next week work for a quick check-in?");
  await demo.getByRole("button", { name: "Preview message", exact: true }).click();
  await demo.getByRole("button", { name: "Choose next step" }).click();
  await demo.getByRole("radio", { name: "Leave it for now" }).check();
  await demo.getByRole("button", { name: "Finish practice" }).click();
  await expect(demo.getByRole("heading", { name: "Left for now" })).toBeVisible();
  await expect(demo.getByRole("status")).toContainText("Nothing was sent or scheduled");
  await expect(demo.locator('a[href^="sms:"],a[href^="mailto:"],a[href^="tel:"]')).toHaveCount(0);
  expect(mutations).toEqual([]);
});

test("changing examples preserves edits and reset only clears the chosen example", async ({ page }) => {
  await page.goto("/");
  const demo = page.locator("#sample");
  await demo.getByRole("textbox").fill("Keep this client wording");
  await demo.getByText("Change example", { exact: true }).click();
  await demo.getByRole("combobox", { name: "Example", exact: true }).selectOption("personal");
  await demo.getByRole("textbox").fill("Keep this personal wording");
  await demo.getByRole("combobox", { name: "Example", exact: true }).selectOption("client");
  await expect(demo.getByRole("textbox")).toHaveValue("Keep this client wording");
  await demo.getByRole("button", { name: "Reset example" }).click();
  await expect(demo.getByRole("textbox")).not.toHaveValue("Keep this client wording");
  await demo.getByRole("combobox", { name: "Example", exact: true }).selectOption("personal");
  await expect(demo.getByRole("textbox")).toHaveValue("Keep this personal wording");
});

test("every profession has one brief example and carries its context into access", async ({ page }) => {
  for (const slug of ["real-estate-agents", "consultants", "photographers", "contractors", "independent-recruiters"]) {
    await page.goto(`/for/${slug}`);
    const demo = page.locator("#sample");
    await expect(demo.getByRole("textbox")).toBeEnabled();
    expect((await demo.getByRole("textbox").inputValue()).length).toBeLessThan(300);
    await expect(demo.getByRole("combobox")).toHaveCount(0);
    await demo.getByRole("button", { name: "Preview message", exact: true }).click();
    await demo.getByRole("button", { name: "Choose next step" }).click();
    await demo.getByRole("button", { name: "Finish practice" }).click();
    await expect(demo.getByRole("status")).toContainText("would appear in Today tomorrow");
    const selection = await demo.getAttribute("data-marketing-scenario");
    expect(selection).toBeTruthy();
    await expect(demo.getByRole("link", { name: "Join the waitlist" })).toHaveAttribute("href", `/waitlist?scenario=${encodeURIComponent(selection!)}`);
    await expect(page.locator('input[name="scenario"]')).toHaveValue(selection!);
  }
});

test("guided demo is accessible and fits small screens in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");
    const demo = page.locator("#sample");
    for (const action of ["Preview message", "Choose next step", "Finish practice", null]) {
      await expect(demo.getByRole("heading", { level: 3 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const scan = await new AxeBuilder({ page }).include("#sample").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(scan.violations.map(v => v.id)).toEqual([]);
      if (action) await demo.getByRole("button", { name: action, exact: true }).click();
    }
  }
});
