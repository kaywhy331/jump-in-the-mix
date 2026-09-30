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

test("the pricing page and the FAQ state the plans without offering checkout", async ({ page }) => {
  const response = await page.goto("/pricing");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("Plans and pricing | Jump in the Mix");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Plans and pricing");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/pricing$/);
  await expect(page.locator(".pricing-card h2")).toHaveText(["Free", "Plus", "Pro"]);
  await expect(page.locator(".pricing-price")).toHaveText(["$0", "$15 a month", "$29 a month"]);
  await expect(page.locator(".pricing-yearly")).toHaveText(["No card needed", "or $144 a year", "or $288 a year"]);
  await expect(page.locator(".pricing-limits").first()).toHaveText(/Up to 100 people with follow-ups\s*Up to 3 active Mixes/);
  await expect(page.getByRole("main")).toContainText("Paid plans haven’t started yet");
  await expect(page.getByRole("main").getByRole("link", { name: "Join the waitlist" })).toHaveAttribute("href", "/waitlist");
  await expect(page.getByRole("button", { name: /buy|subscribe|upgrade|choose/i })).toHaveCount(0);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  expect((await axeInPage(page).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  await page.goto("/faq#cost");
  const cost = page.locator("#cost");
  await cost.locator("summary").click();
  await expect(cost.locator("p")).toHaveText("Not during the beta. Joining the waitlist and creating your account are free, and no card is required. Paid plans haven’t started yet. When they do, the plans are Free ($0), Plus ($15 a month) and Pro ($29 a month), and you’re charged only if you choose a paid plan. See the plans.");
  await Promise.all([page.waitForURL(/\/pricing$/), cost.getByRole("link", { name: "See the plans" }).click()]);
  await expect(page.locator(".public-footer a[href='/pricing']")).toHaveText("Pricing");
});

test("the homepage explains the mechanism, links the routes and carries accurate structured data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Put client follow-up into a rhythm." })).toBeVisible();
  await expect(page.locator("#how-it-works")).toContainText("A Mix is a reusable follow-up plan. Each Beat is one scheduled message or call reminder");
  // The reply boundary moved from "How it works" into the own-voice section's product definition.
  await expect(page.getByRole("region", { name: "Keep the rhythm. Keep your own voice.", exact: true })).toContainText("does not read or interpret replies");
  await expect(page.locator(".profession-grid li a[href='/for/contractors']")).toHaveText("Contractors");
  const data = JSON.parse(await page.locator('script[type="application/ld+json"]').first().evaluate(element => element.textContent ?? "{}"));
  expect(data["@graph"].map((node: { "@type": string }) => node["@type"])).toEqual(["Organization", "WebSite", "SoftwareApplication"]);
  // Property names only: the description legitimately says "You review and send messages yourself".
  expect(JSON.stringify(data)).not.toMatch(/"(aggregateRating|offers|price|review|reviews|ratingValue)":/);
});
