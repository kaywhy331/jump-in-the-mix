import { expect, test } from "@playwright/test";

test("demo edits survive scenario switches and practice never opens a communication app", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Try the demo", exact: true }).click();
  const draft = page.locator('.demo-beats:not([hidden]) textarea').first();
  await expect(draft).toBeFocused();
  await draft.fill("Keep this practice wording");
  await page.getByRole("radio", { name: "Quote", exact: true }).check();
  await page.getByRole("radio", { name: "Lead", exact: true }).check();
  await expect(draft).toHaveValue("Keep this practice wording");
  await page.getByRole("button", { name: "Preview text", exact: true }).first().click();
  await expect(page.getByText(/Practice preview:.*nothing was sent/)).toBeVisible();
  await expect(page.locator('#sample a[href^="sms:"],#sample a[href^="mailto:"],#sample a[href^="tel:"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Reset entire demo" }).click();
  await expect(draft).not.toHaveValue("Keep this practice wording");
});

test("every profession CTA carries the selected example", async ({ page }) => {
  await page.goto("/for/consultants");
  await page.getByRole("radio", { name: "After the handover", exact: true }).check();
  for (const link of await page.getByRole("link", { name: /Join the waitlist/ }).all()) await expect(link).toHaveAttribute("href", /scenario=consulting%7Ehandover|scenario=consulting~handover/);
  await expect(page.locator('input[name="scenario"]')).toHaveValue("consulting~handover");
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
