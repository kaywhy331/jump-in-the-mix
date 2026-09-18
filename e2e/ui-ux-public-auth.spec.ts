import { expect, test } from "@playwright/test";

test("profession access links carry the demonstrated short example", async ({ page }) => {
  await page.goto("/for/consultants");
  await expect(page.locator("#sample textarea")).toBeEnabled();
  for (const link of await page.getByRole("link", { name: /Join the waitlist/ }).all()) await expect(link).toHaveAttribute("href", /scenario=consulting%7Emilestone|scenario=consulting~milestone/);
  await expect(page.locator('input[name="scenario"]')).toHaveValue("consulting~milestone");
});

test("sign-in preserves the requested page and retains email after validation", async ({ page }) => {
  test.skip(!(process.env.PLAYWRIGHT_BASE_URL ?? "").includes("127.0.0.1"), "Local synthetic member only");
  await page.goto("/contacts/demo_contact_sarah/edit");
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel("Email", { exact: true }).fill("demo@jumpinthemix.local");
  await page.getByLabel("Password", { exact: true }).fill("IncorrectPasswordForTest");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("The email or password is incorrect.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("demo@jumpinthemix.local");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await page.getByLabel("Password", { exact: true }).fill("JumpInTheMix123!");
  await page.getByRole("button", { name: "Show password", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/contacts\/demo_contact_sarah\/edit$/);
});
