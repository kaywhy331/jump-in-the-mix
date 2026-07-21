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

test("Contact search updates while typing and shows phone, email, and customer notes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The live Contact search is exercised once.");
  await signIn(page);
  await page.goto("/contacts");

  const search = page.getByLabel("Search contacts").filter({ visible: true });
  await search.fill("sarah@example.com");
  await expect(page).toHaveURL(/\/contacts\?q=sarah%40example\.com$/);
  await expect(search).toHaveValue("sarah@example.com");
  await expect(search).toBeFocused();

  const rows = page.locator(".contact-row:visible");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Sarah Chen");
  await expect(rows.first()).toContainText("+1 555 010 1001");
  await expect(rows.first()).toContainText("sarah@example.com");
  await expect(rows.first()).toContainText("Introduced by a long-term client.");
});

test("search and select filters update automatically on other app surfaces", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The shared live-filter behavior is exercised once.");
  await signIn(page);

  await page.goto("/mixes");
  await page.getByLabel("Search Mixes").fill("Warm Relationship");
  await expect(page).toHaveURL(/\/mixes\?q=Warm\+Relationship$/);
  await expect(page.getByText("Warm Relationship Follow-Up", { exact: true })).toBeVisible();
  await page.getByLabel("Filter Mixes by status").selectOption("ACTIVE");
  await expect(page).toHaveURL(/\/mixes\?q=Warm\+Relationship&status=ACTIVE$/);

  await page.goto("/templates");
  await page.getByLabel("Search Mix Templates").fill("Renewal Value");
  await expect(page).toHaveURL(/\/templates\?source=platform&q=Renewal\+Value/);
  await expect(page.getByRole("heading", { name: "Renewal Value Check-In" })).toBeVisible();

  await page.goto("/settings/jumps");
  await page.getByLabel("Search Action Templates").fill("Discovery call");
  await expect(page).toHaveURL(/\/settings\/jumps\?q=Discovery\+call$/);
  await expect(page.getByRole("heading", { name: "Discovery call" })).toBeVisible();
});

test("Contact mobile header actions include icons", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile header actions are checked once.");
  await signIn(page);
  await page.goto("/contacts/demo_contact_sarah");

  const edit = page.getByRole("link", { name: "Edit contact" });
  const back = page.getByRole("link", { name: "Back to Contacts" });
  await expect(edit).toBeVisible();
  await expect(back).toBeVisible();
  await expect(edit.locator("svg")).toHaveCount(1);
  await expect(back.locator("svg")).toHaveCount(1);

  await edit.click();
  const backToContact = page.getByRole("link", { name: "Back to Contact" });
  await expect(backToContact).toBeVisible();
  await expect(backToContact.locator("svg")).toHaveCount(1);
});

test("Important Dates are compact, editable, collapsible, and keep user card order", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The stateful card workspace is exercised once.");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const contactId = `e2e-card-contact-${suffix}`;
  const jumpDateId = `e2e-card-date-${suffix}`;
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: "demo_workspace" } });
  const followUpType = await prisma.dateType.findUniqueOrThrow({ where: { id: "system_follow_up" } });

  await prisma.contact.create({
    data: {
      id: contactId,
      workspaceId: workspace.id,
      firstName: "Layout",
      lastName: "Tester",
      displayName: "Layout Tester",
      publicNotes: "Met at a neighborhood business event.",
      privateNotes: "Discuss the current proposal during the next call.",
      emails: { create: { email: `layout-${suffix}@example.com`, normalized: `layout-${suffix}@example.com`, isPrimary: true } },
      phones: { create: { phone: "+1 555 012 4545", normalized: "15550124545", isPrimary: true } },
      jumpDates: {
        create: {
          id: jumpDateId,
          workspaceId: workspace.id,
          dateTypeId: followUpType.id,
          dateValue: new Date("2026-08-12T12:00:00.000Z"),
          month: 8,
          day: 12,
          recurrence: "NONE",
          timezone: "America/New_York",
          label: "Initial label"
        }
      }
    }
  });

  try {
    await signIn(page);
    await page.goto(`/contacts/${contactId}`);
    await page.evaluate((key) => {
      localStorage.removeItem(`${key}:order`);
      localStorage.removeItem(`${key}:collapsed`);
    }, `jitm:contact:${contactId}:cards`);
    await page.reload();

    const datesCard = page.locator('[data-user-card="important-dates"]');
    await expect(datesCard).toBeVisible();
    await expect(datesCard.getByLabel("Edit Follow-up")).toBeVisible();
    const remove = datesCard.getByLabel("Remove Follow-up");
    await expect(remove).toBeVisible();
    const removeBox = await remove.boundingBox();
    expect(removeBox).not.toBeNull();
    expect(Math.abs(removeBox!.width - removeBox!.height)).toBeLessThanOrEqual(2);

    await datesCard.getByLabel("Edit Follow-up").click();
    const editPanel = datesCard.locator(".important-date-edit-panel");
    await editPanel.getByLabel("Label").fill("Updated relationship check-in");
    await Promise.all([
      page.waitForURL(/dateUpdated=1/),
      editPanel.getByRole("button", { name: "Save changes" }).click()
    ]);
    await expect(page.getByText("Updated relationship check-in", { exact: true })).toBeVisible();

    const toggle = page.locator('[data-user-card="important-dates"] .personalizable-card-toggle');
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.reload();
    await expect(page.locator('[data-user-card="important-dates"] .personalizable-card-toggle')).toHaveAttribute("aria-expanded", "false");

    const methodsCard = page.locator('[data-user-card="contact-methods"]');
    await methodsCard.getByRole("button", { name: "Move Contact methods up" }).click();
    await methodsCard.getByRole("button", { name: "Move Contact methods up" }).click();
    await expect(page.locator("[data-personalizable-card-board] > [data-user-card]").first()).toHaveAttribute("data-user-card", "contact-methods");
    await page.reload();
    await expect(page.locator("[data-personalizable-card-board] > [data-user-card]").first()).toHaveAttribute("data-user-card", "contact-methods");
  } finally {
    await prisma.contact.deleteMany({ where: { id: contactId, workspaceId: workspace.id } });
  }
});
