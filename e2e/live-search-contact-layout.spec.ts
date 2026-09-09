import { expect, test, type Page } from "@playwright/test";

const userEmail = process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local";
const userPassword = process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(userEmail);
  await page.getByLabel("Password").fill(userPassword);
  await Promise.all([
    page.waitForURL(/\/(jumps|onboarding)(\?|$)/),
    page.getByRole("button", { name: "Sign in" }).click()
  ]);
}

test("Contact search updates while typing and shows useful details", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The live contact search is exercised once.");
  await signIn(page);
  await page.goto("/contacts");

  await expect(page.locator("form.live-search-form")).toHaveAttribute("data-live-filter", "true");
  const search = page.locator('input[aria-label="Search contacts"]:visible');
  await search.fill("sarah@example.com");
  await expect(page).toHaveURL(/\/contacts\?q=sarah%40example\.com$/);
  await expect(search).toHaveValue("sarah@example.com");
  await expect(search).toBeFocused();

  const rows = page.locator(".contact-row:visible");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Sarah Chen");
  await expect(rows.first()).toContainText("+1 555 010 1001");
  await expect(rows.first()).toContainText("sarah@example.com");
  await expect(rows.first()).toContainText("Introduced by a past customer");
});

test("Plan and ready-made plan filters stay focused", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The plan filters are exercised once.");
  await signIn(page);

  await page.goto("/mixes");
  await expect(page.locator(".mix-filter-bar")).toHaveAttribute("data-live-filter", "true");
  await page.locator('input[aria-label="Search mixes"]:visible').fill("Estimate");
  await expect(page).toHaveURL(/\/mixes\?q=Estimate$/);
  await expect(page.locator(".mix-row")).toHaveCount(1);
  await page.getByRole("button", { name: /^Filter/ }).click();
  await page.getByLabel("Filter mixes by status").selectOption("ACTIVE");
  await expect(page).toHaveURL(/\/mixes\?q=Estimate&status=ACTIVE$/);

  await page.goto("/templates");
  await expect(page.locator(".plan-library-filters")).toHaveAttribute("data-live-filter", "true");
  await page.getByLabel("Search ready-made mixes").fill("review");
  await expect(page).toHaveURL(/\/templates\?q=review/i);
  await expect(page.locator(".mix-template-card").first()).toBeVisible();
});

test("Contact mobile header actions include icons", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile header actions are checked once.");
  await signIn(page);
  await page.goto("/contacts/demo_contact_sarah");

  const headerActions = page.locator(".contact-detail-header-actions");
  const edit = headerActions.getByRole("link", { name: "Edit", exact: true });
  const back = headerActions.getByRole("link", { name: "Back to contacts", exact: true });
  await expect(edit).toBeVisible();
  await expect(back).toBeVisible();
  await expect(edit.locator("svg")).toHaveCount(1);
  await expect(back.locator("svg")).toHaveCount(1);
});

test("Contact details use a fixed phone-first layout", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The fixed contact layout is exercised once.");
  await signIn(page);
  await page.goto("/contacts/demo_contact_sarah");

  const primary = page.locator(".contact-detail-primary");
  await expect(primary.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect(primary.getByRole("heading", { name: "Relationship" })).toBeVisible();
  await expect(primary.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(page.locator("[data-personalizable-card-board]")).toHaveCount(0);

  await page.locator(".contact-detail-more > summary").click();
  await expect(page.getByRole("heading", { name: "Contact details" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dates" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mixes" })).toBeVisible();
});
