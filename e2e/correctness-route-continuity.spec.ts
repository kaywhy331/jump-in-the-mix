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

test("legacy Account destinations resolve to the correct section", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Account route normalization is exercised once.");
  await signIn(page);

  await page.goto("/account#referrals");
  await expect(page).toHaveURL(/\/account\?section=referrals#referrals$/);
  await expect(page.getByRole("heading", { name: "Invite friends to Jump in the Mix" })).toBeVisible();

  await page.goto("/account?google=connected");
  await expect(page).toHaveURL(/\/account\?google=connected&section=connections$/);
  await expect(page.getByRole("heading", { name: "Google Contacts" })).toBeVisible();

  await page.goto("/more");
  await expect(page.getByRole("link", { name: /Referrals/ })).toHaveAttribute("href", "/account?section=referrals");
});

test("name-only Contacts keep Important Date access and return to the filtered list", async ({ page }, testInfo) => {
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

    await expect(page.getByRole("link", { name: "Add Important Date" })).toBeVisible();
    const datesCard = page.locator('[data-user-card="important-dates"]');
    await datesCard.getByLabel("Edit Birthday").click();
    const editPanel = datesCard.locator(".important-date-edit-panel");
    await expect(editPanel.locator('input[name="dateValue"]')).toHaveCount(0);
    await expect(editPanel.locator('select[name="month"]')).toHaveValue("2");
    await expect(editPanel.locator('input[name="day"]')).toHaveValue("29");
    await editPanel.locator('input[name="day"]').fill("28");
    await Promise.all([
      page.waitForURL(/dateUpdated=1/),
      editPanel.getByRole("button", { name: "Save changes" }).click()
    ]);
    await expect(page.getByText("2/28", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Back to Contacts" }).click();
    await expect(page).toHaveURL(new RegExp(`/contacts\\?q=${encodeURIComponent(displayName).replaceAll("%", "%")}$`));
    await expect(page.locator('input[aria-label="Search contacts"]:visible')).toHaveValue(displayName);
  } finally {
    await prisma.contact.deleteMany({ where: { id: contactId, workspaceId: workspace.id } });
  }
});
