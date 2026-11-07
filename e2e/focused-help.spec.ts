import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { INITIAL_FAQ_COUNT } from "../src/components/SupportFaq";
import { SUPPORT_CATEGORIES, SUPPORT_FAQS } from "../src/lib/support-content";
import { createSupportFixture } from "../tests/helpers/support-fixture";
import { axeInPage } from "./axe-in-page";
import { applyRenderedTheme } from "./theme-fixture";

const enabled = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!enabled, "Requires a disposable loopback database.");
test.use({ screenshot: "off", trace: "off", video: "off" });
let fixture: Awaited<ReturnType<typeof createSupportFixture>>;
test.beforeEach(async ({ context }, info) => {
  fixture = await createSupportFixture();
  await context.addCookies([{ name: "jitm_session", value: fixture.customer.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
});
test.afterEach(async () => { if (fixture) await fixture.cleanup(); });

test("Help starts short while search, topics and View all reach the full FAQ", async ({ page }) => {
  await page.goto("/help");
  const faq = page.getByRole("region", { name: "Frequently asked questions" });
  const answers = faq.locator(".support-faq-item");
  await expect(answers).toHaveCount(INITIAL_FAQ_COUNT);
  const viewAll = faq.getByRole("button", { name: "View all", exact: true });
  await viewAll.focus();
  await page.keyboard.press("Enter");
  await expect(answers).toHaveCount(SUPPORT_FAQS.length);
  await expect(faq.getByRole("button", { name: "Show fewer" })).toHaveAttribute("aria-expanded", "true");
  await faq.getByRole("button", { name: "Show fewer" }).click();
  await expect(answers).toHaveCount(INITIAL_FAQ_COUNT);

  const lastAnswer = SUPPORT_FAQS.at(-1)!;
  await faq.getByLabel("Search Help").fill(lastAnswer.question);
  await expect(answers).toHaveCount(1);
  await expect(answers).toContainText(lastAnswer.question);
  await answers.locator("summary").click();
  await expect(answers.locator("p")).toHaveText(lastAnswer.answer);
  await faq.getByLabel("Search Help").fill("");
  await faq.getByRole("combobox", { name: "Topic", exact: true }).selectOption("Mixes");
  await expect(answers).toHaveCount(SUPPORT_FAQS.filter(item => item.category === "Mixes").length);
  await faq.getByLabel("Search Help").fill("no-matching-faq-synthetic");
  await expect(faq.getByText("No FAQ matched that search.")).toBeVisible();
  await expect(faq.getByRole("link", { name: "contact support", exact: true })).toHaveAttribute("href", "#contact-support");
  await faq.getByRole("button", { name: "Clear filters" }).click();
  await expect(faq.getByLabel("Search Help")).toHaveValue("");
  await expect(faq.getByRole("combobox", { name: "Topic", exact: true })).toHaveValue("all");
  await expect(answers).toHaveCount(INITIAL_FAQ_COUNT);
});

test("Contact support reveals a retained draft, category-specific action and existing requests route", async ({ page }) => {
  await page.goto("/help");
  const requests = page.getByRole("link", { name: "My requests", exact: true });
  await expect(requests).toHaveAttribute("href", "/account/tickets");
  await requests.click();
  await expect(page).toHaveURL(/\/account\/tickets$/);
  await page.goto("/help");
  const contact = page.locator("#contact-support");
  const form = contact.locator("form");
  await expect(form).toBeHidden();
  await page.getByRole("link", { name: "Contact support", exact: true }).click();
  await expect(form).toBeVisible();
  await expect(contact.locator(":scope > summary")).toBeFocused();
  await form.getByLabel("Short title").fill("Synthetic retained draft");
  for (const category of SUPPORT_CATEGORIES) {
    await form.getByRole("combobox", { name: "Topic", exact: true }).selectOption(category.value);
    await expect(form.getByRole("button", { name: category.value === "FEATURE_REQUEST" ? "Send feedback" : "Send request", exact: true })).toBeVisible();
  }
  await contact.locator(":scope > summary").click();
  await expect(form).toBeHidden();
  // The same anchor must reopen the form even when the URL hash has not changed.
  await page.getByRole("link", { name: "Contact support", exact: true }).click();
  await expect(form).toBeVisible();
  await expect(form.getByLabel("Short title")).toHaveValue("Synthetic retained draft");
  await expect(form.getByRole("combobox", { name: "Topic", exact: true })).toHaveValue("FEATURE_REQUEST");
});

test("Help and its deep-linked form reflow in both themes with keyboard and enlarged text", async ({ page }, info) => {
  await page.goto("/help#contact-support");
  await expect(page.locator("#contact-support form")).toBeVisible();
  await mkdir(".artifacts/focused-help/captures", { recursive: true });
  const widths = info.project.name === "mobile-chromium" ? [320, 390, 834] : [1194, 1920];
  for (const theme of ["light", "dark"] as const) for (const width of widths) {
    await applyRenderedTheme(page, theme, { width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect((await axeInPage(page).include(".help-page").analyze()).violations).toEqual([]);
    await page.screenshot({ path: `.artifacts/focused-help/captures/help-${theme}-${width}.png`, fullPage: true });
  }
  for (const theme of ["light", "dark"] as const) {
    await applyRenderedTheme(page, theme, { width: 320, height: 1000 });
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const title = page.getByLabel("Short title");
    await title.focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("What happened?")).toBeFocused();
    await page.getByRole("button", { name: "Send request", exact: true }).focus();
    expect(await page.getByRole("button", { name: "Send request", exact: true }).evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
    await page.screenshot({ path: `.artifacts/focused-help/captures/help-${theme}-320-200-${info.project.name}.png`, fullPage: true });
  }
});
