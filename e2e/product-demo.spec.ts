import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { DEMO_BEATS, demoSituations } from "../src/lib/demo-workspace";
import { MARKETING_SCENARIOS } from "../src/lib/marketing-scenarios";

test("Today demo supports editing, previews, truthful outcomes, Not yet and Undo", async ({ page }) => {
  const mutations: string[] = [];
  const errors: string[] = [];
  page.on("request", request => { if (!["GET", "HEAD"].includes(request.method())) mutations.push(request.url()); });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("link", { name: "Try the demo", exact: true }).click();
  const demo = page.locator("#sample");
  const message = demo.getByRole("textbox", { name: "Message to Alex Morgan" });
  await expect(message).toBeFocused();
  const schedule = demo.getByRole("list", { name: "Mix schedule" });
  await expect(schedule.getByRole("button")).toHaveText(["TextToday", "EmailTomorrow", "CallIn 1 week"]);
  await message.fill(" ");
  await expect(demo.getByRole("button", { name: "Preview SMS" })).toBeDisabled();
  await message.fill("Hi Alex, would next week work for a quick check-in?");
  await page.keyboard.press("Tab");
  await expect(demo.getByRole("button", { name: "Preview SMS" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(demo.getByRole("heading", { name: "SMS preview" })).toBeFocused();
  await expect(demo.locator("blockquote")).toContainText("would next week work");
  await expect(schedule).not.toContainText("Done in demo");
  await demo.getByRole("button", { name: "Not yet", exact: true }).click();
  await expect(message).toHaveValue("Hi Alex, would next week work for a quick check-in?");
  await demo.getByRole("button", { name: "Preview SMS" }).click();
  await demo.getByRole("button", { name: "Mark sent (demo)", exact: true }).click();
  await expect(demo.getByRole("status")).toContainText("Nothing was sent");
  await expect(demo.getByText("Today’s Beat done", { exact: true })).toBeVisible();
  await demo.getByRole("button", { name: "Undo recorded outcome" }).click();
  await expect(schedule).not.toContainText("Done in demo");
  await expect(message).toHaveValue("Hi Alex, would next week work for a quick check-in?");
  for (const beat of DEMO_BEATS) {
    await demo.locator(`[data-demo-beat="${beat.channel}"]`).click();
    await demo.getByRole("button", { name: beat.preview, exact: true }).click();
    await expect(demo.locator(`[data-demo-preview="${beat.channel}"]`)).toBeVisible();
    await demo.getByRole("button", { name: beat.channel === "phone" ? "Mark called (demo)" : "Mark sent (demo)", exact: true }).click();
  }
  await expect(demo.getByRole("link", { name: "Join the waitlist" })).toHaveAttribute("href", "/waitlist");
  await expect(schedule.getByRole("button")).toHaveText(["TextTodayDone in demo", "EmailTomorrowDone in demo", "CallIn 1 weekDone in demo"]);
  await expect(demo.locator('a[href^="sms:"],a[href^="mailto:"],a[href^="tel:"]')).toHaveCount(0);
  expect(mutations).toEqual([]);
  expect(errors).toEqual([]);
});

test("situations retain separate drafts, subjects and progress; reset affects only the current one", async ({ page }) => {
  await page.goto("/");
  const demo = page.locator("#sample");
  await demo.getByRole("textbox").fill("Keep this client wording");
  await demo.locator('[data-demo-beat="email"]').click();
  await demo.getByRole("textbox", { name: "Subject", exact: true }).fill("Keep my subject");
  await demo.getByRole("textbox", { name: "Message to Alex Morgan" }).fill("Keep my email body");
  await demo.getByRole("button", { name: "Preview email", exact: true }).click();
  await demo.getByRole("combobox", { name: "Situation" }).selectOption("personal");
  await demo.getByRole("textbox").fill("Keep this personal wording");
  await demo.getByRole("combobox", { name: "Situation" }).selectOption("client");
  await expect(demo.locator("blockquote")).toContainText("Keep my email body");
  await expect(demo.locator('[data-demo-preview="email"]')).toContainText("Keep my subject");
  await demo.getByRole("button", { name: "Back to edit" }).click();
  await demo.locator('[data-demo-beat="text"]').click();
  await expect(demo.getByRole("textbox")).toHaveValue("Keep this client wording");
  await demo.getByRole("button", { name: "Reset example" }).click();
  await expect(demo.getByRole("textbox")).not.toHaveValue("Keep this client wording");
  await demo.getByRole("combobox", { name: "Situation" }).selectOption("personal");
  await expect(demo.getByRole("textbox")).toHaveValue("Keep this personal wording");
});

test("every situation uses SMS today, email tomorrow and a call in seven days, with valid access context", async ({ page }) => {
  test.setTimeout(120_000);
  for (const persona of [undefined, ...MARKETING_SCENARIOS]) {
    await page.goto(persona ? `/for/${persona.slug}` : "/");
    const demo = page.locator("#sample");
    for (const situation of demoSituations(persona?.id)) {
      await demo.getByRole("combobox", { name: "Situation" }).selectOption(situation.id);
      await expect(demo.locator('[data-demo-beat="text"]')).toHaveAttribute("aria-current", "step");
      for (const beat of DEMO_BEATS) {
        const node = demo.locator(`[data-demo-beat="${beat.channel}"]`);
        await expect(node).toHaveAttribute("data-due-day", String(beat.day));
        await expect(node).toContainText(beat.due);
        await node.click();
        await expect(demo.getByRole("heading", { level: 3 })).toContainText(beat.due.toLowerCase());
        await demo.getByRole("button", { name: beat.preview, exact: true }).click();
        await expect(demo.locator(`[data-demo-preview="${beat.channel}"]`)).toContainText(situation.person);
        await demo.getByRole("button", { name: beat.channel === "phone" ? "Mark called (demo)" : "Mark sent (demo)", exact: true }).click();
      }
      if (persona) {
        const selection = `${persona.id}~${situation.id}`;
        await expect(demo).toHaveAttribute("data-marketing-scenario", selection);
        await expect(demo.getByRole("link", { name: "Join the waitlist" })).toHaveAttribute("href", `/waitlist?scenario=${encodeURIComponent(selection)}`);
        await expect(page.locator('input[name="scenario"]')).toHaveValue(selection);
      }
    }
  }
});

test("all channel editors and previews reflow accessibly in both themes", async ({ page }) => {
  test.setTimeout(180_000);
  for (const width of [320, 390, 834, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto("/");
      const demo = page.locator("#sample");
      for (const beat of DEMO_BEATS) {
        await demo.locator(`[data-demo-beat="${beat.channel}"]`).click();
        for (const view of ["edit", "preview"]) {
          if (view === "preview") await demo.getByRole("button", { name: beat.preview, exact: true }).click();
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          // Scan all six states at the narrowest width; wider layouts still check fit.
          if (width === 320) {
            const scan = await new AxeBuilder({ page }).include("#sample").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
            expect(scan.violations.map(v => v.id)).toEqual([]);
          }
        }
      }
    }
  }
});

test("without JavaScript, the fictional schedule and access link remain readable", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(baseURL ?? "http://127.0.0.1:3000");
  expect(await page.locator("#sample noscript").textContent()).toContain("text today, email tomorrow, and a call in one week");
  await expect(page.locator("#sample").getByRole("list", { name: "Mix schedule" })).toContainText("Tomorrow");
  await expect(page.locator("#sample noscript a")).toHaveAttribute("href", "/waitlist");
  await context.close();
});
