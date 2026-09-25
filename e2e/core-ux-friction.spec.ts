import { expect, test, type Page } from "@playwright/test";
import { createPendingJumpFixture, removePendingJumpFixture } from "./pending-jump-fixture";

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

test("mobile Today keeps Review visible and completion in More", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile completion geometry is checked once.");
  const pendingJumpId = await createPendingJumpFixture("Mobile completion geometry");
  try {
    await signIn(page);
    await page.goto("/jumps");
    const card = page.locator(`[data-jump-workflow="${pendingJumpId}"]:visible`);
    await card.getByRole("button", { name: /^More options for/ }).click();
    const markDone = card.getByRole("button", { name: /^Mark done for/ });
    await expect(markDone).toBeVisible();
    const box = await markDone.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(40);
    expect(box!.height).toBeGreaterThanOrEqual(40);
  } finally {
    await removePendingJumpFixture(pendingJumpId);
  }
});

test("Quick Add carries recognized fields into Contact and follow-up creation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The structured handoff is checked once.");
  await signIn(page);
  await page.goto("/jumps");
  await page.getByRole("button", { name: "Quick Add", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Quick Add" });
  await dialog.getByLabel("What do you want to remember?").fill("Follow up with Jordan Lee next Monday about the proposal");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();

  // Continue opens the review inside the dialog: the recognized person and follow-up are
  // prefilled together and saved in one step (nothing is saved here).
  await expect(dialog.getByText("Saving as", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Person", exact: true }).getByRole("heading", { name: "New person", exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Name or search for someone", { exact: true })).toHaveValue("Jordan Lee");
  await expect(dialog.getByRole("checkbox", { name: "Follow-up", exact: true })).toBeChecked();
  await expect(dialog.getByLabel("Follow-up date", { exact: true })).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await expect(dialog.getByLabel("Reason", { exact: true })).toHaveValue("the proposal");
  await expect(dialog.getByRole("button", { name: "Save all 3", exact: true })).toBeVisible();
  expect(page.url()).toMatch(/\/jumps$/);
});

test("Quick Add carries a recognized phone without folding it into the Contact name", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The structured phone handoff is checked once.");
  await signIn(page);
  await page.goto("/jumps");
  await page.getByRole("button", { name: "Quick Add", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Quick Add" });
  await dialog.getByLabel("What do you want to remember?").fill("Add Sam with 626-555-0100");
  await dialog.getByRole("button", { name: "Continue", exact: true }).click();
  // The review names the new person without the number and lists the number as their phone.
  await expect(dialog.getByText("Saving as", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Name or search for someone", { exact: true })).toHaveValue("Sam");
  const phoneDetails = dialog.getByText("626-555-0100", { exact: true });
  await expect(phoneDetails).toBeVisible();
  await phoneDetails.click();
  await expect(dialog.getByLabel("Phone", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Phone", { exact: true })).toHaveValue("626-555-0100");
  await expect(dialog.getByRole("button", { name: "Save all 2", exact: true })).toBeVisible();
});

test("Contact selection is a direct list control", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The selection entry point is checked once.");
  await signIn(page);
  await page.goto("/contacts");
  await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", "");
  // Selection starts from the Contact tools sheet; the list then shows a checkbox per row and a Done control.
  await page.getByRole("button", { name: "More contact tools", exact: true }).click();
  await page.getByRole("dialog", { name: "Contact tools", exact: true }).getByRole("button", { name: "Select contacts", exact: true }).click();
  await expect(page.getByRole("button", { name: "Done", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /^Select / }).first()).toBeVisible();
});
