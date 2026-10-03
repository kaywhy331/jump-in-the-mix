import { expect, test } from "@playwright/test";
import { axeInPage } from "./axe-in-page";
test("unavailable recovery email and incomplete reset links offer a usable public support path", async ({ page }) => {
  test.skip(Boolean(process.env.RESEND_API_KEY), "Explicitly mail-free local audit only.");
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page.getByText("Password-reset email is temporarily unavailable.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send reset link" })).toHaveCount(0);
  await page.getByRole("link", { name: "Contact support for help recovering your account" }).click();
  await expect(page.getByRole("link", { name: "support@example.test" })).toHaveAttribute("href", "mailto:support%40example.test");
  await expect(page.getByRole("link", { name: "My account → Data & privacy" })).toHaveAttribute("href", "/account?section=privacy");
  await expect(page.getByRole("link", { name: "Help in the application" })).toHaveAttribute("href", "/help#contact-support");
  await page.goto("/reset-password");
  await expect(page.getByText("This reset link is incomplete. Request a new one.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset password" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Request a new reset link" })).toHaveAttribute("href", "/forgot-password");
  expect((await axeInPage(page).analyze()).violations).toEqual([]);
});
