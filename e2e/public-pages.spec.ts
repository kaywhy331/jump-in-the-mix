import { expect, test } from "@playwright/test";
import { axeInPage } from "./axe-in-page";

test.use({ screenshot: "off", video: "off", trace: "off" });

const PAGES = [
  { path: "/follow-up-templates", heading: "Client follow-up templates for your next conversation.", title: /Client Follow-Up Templates/ },
  { path: "/follow-up-templates/estimate-follow-up", heading: "Estimate follow-up text templates.", title: /Estimate Follow-Up Text Templates/, copies: 4 },
  { path: "/follow-up-templates/proposal-follow-up", heading: "Proposal follow-up emails that give the conversation a next step.", title: /Proposal Follow-Up Email Templates/, copies: 3 },
  { path: "/features/follow-up-reminders", heading: "Follow-up reminders for the things you said you’d do.", title: /Follow-Up Reminder App/ }
];

test("template and feature pages are public, titled, canonical and copyable", async ({ page }) => {
  for (const item of PAGES) {
    const response = await page.goto(item.path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(item.title);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(item.heading);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`${item.path.replaceAll("/", "\\/")}$`));
    await expect(page.locator(".public-footer a[href='/follow-up-templates'], .public-footer a[href='/features/follow-up-reminders']")).toHaveCount(2);
    await expect(page.locator('[class*="eyebrow"]')).toHaveCount(0);
    if (item.copies) {
      const copies = page.getByRole("button", { name: /^Copy (text|email)$/ });
      await expect(copies).toHaveCount(item.copies);
      await copies.first().click();
      await expect(page.getByRole("status").first()).toContainText(/Copied|Copy isn’t available/);
    }
    expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
});

test("the homepage explains the mechanism, links the routes and carries accurate structured data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Put client follow-up into a rhythm." })).toBeVisible();
  await expect(page.locator("#how-it-works")).toContainText("does not read or interpret replies");
  await expect(page.locator(".profession-grid li a[href='/for/contractors']")).toHaveText("Contractors");
  const data = JSON.parse(await page.locator('script[type="application/ld+json"]').first().evaluate(element => element.textContent ?? "{}"));
  expect(data["@graph"].map((node: { "@type": string }) => node["@type"])).toEqual(["Organization", "WebSite", "SoftwareApplication"]);
  // Property names only: the description legitimately says "You review and send messages yourself".
  expect(JSON.stringify(data)).not.toMatch(/"(aggregateRating|offers|price|review|reviews|ratingValue)":/);
});
