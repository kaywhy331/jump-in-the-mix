import { expect, test, type Page } from "@playwright/test";

const userEmail = process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local";
const userPassword = process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(userEmail);
  await page.getByLabel("Password", { exact: true }).fill(userPassword);
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
  // The search keeps the list's sort and the docked person alongside the query.
  await expect(page).toHaveURL(url => url.pathname === "/contacts" && url.searchParams.get("q") === "sarah@example.com");
  await expect(search).toHaveValue("sarah@example.com");
  await expect(search).toBeFocused();

  const rows = page.locator(".contact-row:visible");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Sarah Chen");
  // Rows stay short; from 1200 px the matching person's details are docked beside the list.
  const profile = page.getByRole("region", { name: "Selected contact", exact: true });
  await expect(profile.getByRole("heading", { name: "Sarah Chen", exact: true })).toBeVisible();
  await expect(profile.getByRole("link", { name: "+1 555 010 1001", exact: true })).toBeVisible();
  await expect(profile.getByRole("link", { name: "sarah@example.com", exact: true })).toBeVisible();
  // Notes to remember show open beside the details (D77).
  await expect(profile.getByRole("region", { name: "Notes to remember" }).getByText(/^Introduced by a past customer/)).toBeVisible();
});

test("Plan and ready-made plan filters stay focused", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The plan filters are exercised once.");
  await signIn(page);

  // The Mix libraries search when submitted and filter from a sheet; a filter keeps the search it narrows.
  await page.goto("/mixes");
  const search = page.getByRole("searchbox", { name: "Search Mixes", exact: true });
  await search.fill("Estimate");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/mixes\?q=Estimate$/);
  await expect(page.locator(".mix-library-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Filter Mixes", exact: true }).click();
  const filters = page.getByRole("dialog", { name: "Filter Mixes", exact: true });
  await filters.getByRole("combobox", { name: "Status", exact: true }).selectOption("ACTIVE");
  await filters.getByRole("button", { name: "Apply filters", exact: true }).click();
  await expect(page).toHaveURL(/\/mixes\?q=Estimate&status=ACTIVE$/);
  await expect(page.getByRole("searchbox", { name: "Search Mixes", exact: true })).toHaveValue("Estimate");
  await expect(page.locator(".mix-library-row")).toHaveCount(1);

  await page.goto("/templates");
  const readyMadeSearch = page.getByRole("searchbox", { name: "Search ready-made Mixes", exact: true });
  await readyMadeSearch.fill("review");
  await readyMadeSearch.press("Enter");
  await expect(page).toHaveURL(/\/templates\?q=review/i);
  await expect(page.getByRole("searchbox", { name: "Search ready-made Mixes", exact: true })).toHaveValue("review");
  await expect(page.locator(".mix-library-row").first()).toBeVisible();
});

test("Contact mobile header actions include icons", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile header actions are checked once.");
  await signIn(page);
  await page.goto("/contacts/demo_contact_sarah");

  // Back on the header row, and the profile's ••• menu, which holds Edit (D77), at the end of the name row.
  const headerActions = page.locator(".contact-detail-header-actions");
  const back = headerActions.getByRole("link", { name: "Back to contacts", exact: true });
  const menu = page.locator(".contact-profile-header").getByRole("button", { name: "More options for Sarah Chen", exact: true });
  await expect(back).toBeVisible();
  await expect(menu).toBeVisible();
  await expect(back.locator("svg")).toHaveCount(1);
  await expect(menu.locator("svg")).toHaveCount(1);
  await menu.click();
  await expect(page.getByRole("dialog", { name: "Sarah Chen" }).getByRole("link", { name: "Edit contact", exact: true })).toHaveAttribute("href", "/contacts/demo_contact_sarah/edit");
});

test("Contact details use a fixed phone-first layout", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The fixed contact layout is exercised once.");
  await signIn(page);
  await page.goto("/contacts/demo_contact_sarah");

  // One fixed order: Mixes under the Next card, then the stage and the history, with the details and the notes to
  // remember beside them (D77).
  const primary = page.locator(".contact-detail-primary");
  await expect(page.getByRole("region", { name: "Mixes", exact: true })).toBeVisible();
  await expect(primary.getByRole("heading", { name: "Stage", exact: true })).toBeVisible();
  await expect(primary.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await expect(page.locator(".contact-profile-details").getByRole("heading", { name: "Details", exact: true })).toBeVisible();
  await expect(page.locator(".contact-profile-details").getByRole("heading", { name: "Notes to remember", exact: true })).toBeVisible();
  await expect(page.locator("[data-personalizable-card-board]")).toHaveCount(0);

  // Preferences and dates wait under More; Mixes are no longer there.
  await page.locator(".contact-detail-more > summary").click();
  await expect(page.getByRole("heading", { name: "Preferences", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dates", exact: true })).toBeVisible();
  await expect(page.locator(".contact-detail-more").getByRole("heading", { name: "Mixes", exact: true })).toHaveCount(0);
});
