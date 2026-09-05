import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

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

test("retired commercial, team, provider, and sharing routes stay unavailable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The retired route boundary is exercised once.");
  await signIn(page);

  for (const section of ["billing", "connections", "referrals", "team"]) {
    await page.goto(`/account?section=${section}`);
    expect(new URL(page.url()).pathname).toBe("/account");
    await expect(page.getByRole("heading", { name: "My Account" })).toBeVisible();
    await expect(page.locator("main")).not.toContainText(new RegExp(section, "i"));
  }

  for (const route of [
    "/plans",
    "/account/team",
    "/join",
    "/api/billing/checkout",
    "/api/integrations/google/status",
    "/api/webhooks/stripe",
    "/mixes/wizard",
    "/mixes/example/share",
    "/r/example"
  ]) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(404);
  }

  const prohibited = /\b(?:billing|subscription|checkout|invoice|upgrade|downgrade|team|members|invitations|organization|stripe|google contacts|ai provider)\b/i;
  for (const route of ["/jumps", "/contacts", "/mixes", "/templates", "/more", "/settings", "/account"]) {
    await page.goto(route);
    await expect(page.locator("main")).not.toContainText(prohibited);
  }
});

test("a stale session cookie redirects to sign in instead of crashing a Server Component", async ({ context, page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The stale-session boundary is exercised once.");
  await context.addCookies([{
    name: "jitm_session",
    value: "stale-e2e-session",
    url: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000"
  }]);

  const response = await page.goto("/contacts");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("name-only contacts keep saved-date access and return to the filtered list", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Contact route continuity is exercised once.");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const contactId = `e2e-continuity-contact-${suffix}`;
  const jumpDateId = `e2e-continuity-date-${suffix}`;
  const displayName = `Continuity Tester ${suffix}`;
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: "demo_workspace" } });
  const birthday = await prisma.dateType.findUniqueOrThrow({ where: { id: "system_birthday" } });

  await prisma.contact.create({
    data: {
      id: contactId,
      workspaceId: workspace.id,
      firstName: "Continuity",
      lastName: `Tester ${suffix}`,
      displayName,
      jumpDates: {
        create: {
          id: jumpDateId,
          workspaceId: workspace.id,
          dateTypeId: birthday.id,
          dateValue: null,
          month: 2,
          day: 29,
          recurrence: "YEARLY",
          timezone: "America/New_York",
          label: "Leap-day birthday"
        }
      }
    }
  });

  try {
    await signIn(page);
    await page.goto(`/contacts?q=${encodeURIComponent(displayName)}`);
    const row = page.locator(".contact-row").filter({ hasText: displayName });
    await expect(row).toHaveCount(1);
    await row.locator("a.contact-main").click();

    const more = page.locator("details.contact-detail-more");
    const openMore = async () => {
      if (!await more.evaluate((element) => (element as HTMLDetailsElement).open)) await more.locator(":scope > summary").click();
    };
    await openMore();
    const datesSection = more.locator(".contact-more-sections > section").filter({ has: page.locator("h2", { hasText: /^Dates$/ }) });
    await expect(datesSection.getByRole("button", { name: "Add date" })).toBeVisible();
    await datesSection.getByRole("button", { name: "Edit", exact: true }).click();
    const editDialog = page.getByRole("dialog", { name: "Edit Birthday" });
    await expect(editDialog.locator('input[name="dateValue"]')).toHaveCount(0);
    await expect(editDialog.locator('select[name="month"]')).toHaveValue("2");
    await expect(editDialog.locator('input[name="day"]')).toHaveValue("29");
    await editDialog.locator('input[name="day"]').fill("28");
    await Promise.all([
      page.waitForURL(/dateUpdated=1/),
      editDialog.getByRole("button", { name: "Save date" }).click()
    ]);
    await openMore();
    await expect(page.getByText("2/28", { exact: true })).toBeVisible();

    await datesSection.getByRole("button", { name: "Remove Birthday", exact: true }).click();
    const removeDialog = page.getByRole("dialog", { name: "Remove Birthday?" });
    await Promise.all([
      page.waitForURL(/dateDeleted=1/),
      removeDialog.getByRole("button", { name: "Remove date" }).click()
    ]);
    await expect(page.getByText("2/28", { exact: true })).toHaveCount(0);
    await openMore();
    await expect(datesSection.getByText("No dates saved yet.", { exact: true })).toBeVisible();
    const storedDate = await prisma.jumpDate.findUniqueOrThrow({ where: { id: jumpDateId } });
    expect(storedDate.isActive).toBe(false);

    await page.getByRole("link", { name: "Back to contacts" }).click();
    await expect(page).toHaveURL(/\/contacts\?q=/);
    await expect(page.locator('input[aria-label="Search contacts"]:visible')).toHaveValue(displayName);
  } finally {
    await prisma.contact.deleteMany({ where: { id: contactId, workspaceId: workspace.id } });
  }
});
