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

test("mobile Today keeps Mark done visible for pending Jumps", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "Mobile completion geometry is checked once.");
  await signIn(page);
  await page.goto("/jumps");
  const markDone = page.getByRole("button", { name: "Mark done" }).first();
  await expect(markDone).toBeVisible();
  const box = await markDone.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(40);
  expect(box!.height).toBeGreaterThanOrEqual(40);
});

test("Quick Add carries recognized fields into Contact and follow-up creation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The structured handoff is checked once.");
  await signIn(page);
  await page.goto("/jumps");
  await page.getByRole("button", { name: "Quick Add", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Quick Add" });
  await dialog.getByLabel("What do you want to remember?").fill("Follow up with Jordan Lee next Monday about the proposal");
  await dialog.getByRole("button", { name: /Preview capture|Review/ }).click();
  await dialog.getByRole("link", { name: "Continue with Contact" }).click();

  await expect(page).toHaveURL(/\/contacts\/new\?/);
  await expect(page.getByLabel("First name")).toHaveValue("Jordan");
  await expect(page.getByLabel("Last name")).toHaveValue("Lee");
  await expect(page.getByLabel("Follow-up date")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByLabel("Reason")).toHaveValue("the proposal");
  await expect(page.getByRole("checkbox", { name: /Schedule a follow-up now/ })).toBeChecked();
  await expect(page.getByRole("button", { name: "Save & schedule follow-up" })).toBeVisible();
});

test("Contact selection is a direct list control", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The selection entry point is checked once.");
  await signIn(page);
  await page.goto("/contacts");
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await expect(page.getByRole("button", { name: "Done selecting" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /^Select / }).first()).toBeVisible();
});
