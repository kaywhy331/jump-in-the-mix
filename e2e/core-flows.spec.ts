import { expect, test, type Page } from "@playwright/test";
import { generateTotpCode } from "../src/lib/totp";

const userEmail = process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local";
const userPassword = process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!";
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "admin-e2e@jumpinthemix.local";
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? "AdminJumpInTheMix123!";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL(/\/(jumps|onboarding)(\?|$)/),
    page.getByRole("button", { name: "Sign in" }).click()
  ]);
}

test("workspace user can complete the primary discovery and support journey", async ({ page }, testInfo) => {
  await signIn(page, userEmail, userPassword);

  await page.goto("/jumps");
  await expect(page.getByRole("heading", { name: "Jump", exact: true })).toBeVisible();
  await expect(page.locator(".jump-task-card").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Due" })).toBeVisible();

  await page.goto("/contacts");
  await expect(page.getByRole("heading", { name: "Contacts", exact: true })).toBeVisible();
  await page.locator("summary").filter({ hasText: "+ Add" }).click();
  const addPanel = page.locator(".contact-add-panel");
  await expect(addPanel.locator(".device-contact-picker")).toBeVisible();
  await expect(addPanel.getByRole("link", { name: /Import CSV \/ VCF/ })).toBeVisible();
  await expect(addPanel.getByRole("link", { name: /Google Contacts/ })).toBeVisible();

  await page.goto("/templates");
  await expect(page.getByRole("heading", { name: "Mix Templates" })).toBeVisible();
  await expect(page.getByText("New Lead Follow-Up", { exact: true })).toBeVisible();
  await expect(page.locator(".template-source-tabs").getByText("Jump in the Mix", { exact: true })).toBeVisible();

  await page.goto("/mixes/wizard");
  await expect(page.getByRole("heading", { name: "AI Mix Wizard" })).toBeVisible();
  await expect(page.getByText(/Built-in strategist ready|AI provider connected/)).toBeVisible();

  const ticketTitle = `E2E browser support ticket ${testInfo.project.name}`;
  await page.goto("/help");
  await expect(page.getByRole("heading", { name: "Help & Support" })).toBeVisible();
  await page.getByLabel("Topic").selectOption("GENERAL");
  await page.getByLabel("Ticket title").fill(ticketTitle);
  await page.getByLabel("What happened?").fill("Browser coverage is verifying that a private support conversation can be submitted and opened.");
  await Promise.all([
    page.waitForURL(/\/account\/tickets\//),
    page.getByRole("button", { name: "Submit support ticket" }).click()
  ]);
  await expect(page.getByRole("heading", { name: ticketTitle })).toBeVisible();
});

test("supported mobile browsers can Quick Add a selected device Contact", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "The progressive Contact Picker path is exercised once in the mobile project.");

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "contacts", {
      configurable: true,
      value: {
        getProperties: async () => ["name", "email", "tel", "address"],
        select: async () => [{
          name: ["E2E Device Contact"],
          email: ["e2e-device-contact@jumpinthemix.local"],
          tel: ["+1 (555) 019-9999"],
          address: [{
            addressLine: ["100 Device Lane"],
            city: "Los Angeles",
            region: "CA",
            postalCode: "90001",
            country: "US"
          }]
        }]
      }
    });
  });

  await signIn(page, userEmail, userPassword);
  await page.goto("/contacts");
  await page.locator("summary").filter({ hasText: "+ Add" }).click();
  await page.getByRole("button", { name: /Pick from device/ }).click();
  await expect(page.getByText(/\d+ added · \d+ merged/)).toBeVisible();
});

test("platform administrator must enroll and re-verify MFA before using Admin", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Administrator enrollment runs once against the shared seeded account.");

  await signIn(page, adminEmail, adminPassword);
  await page.goto("/admin");
  await page.waitForURL(/\/account\/admin-mfa/);
  await expect(page.getByRole("heading", { name: "Secure administrator access" })).toBeVisible();

  const secret = (await page.getByTestId("mfa-secret").textContent())?.trim();
  expect(secret).toBeTruthy();
  await page.getByLabel("Current password").fill(adminPassword);
  await page.getByLabel("Authenticator code").fill(generateTotpCode(secret!));
  await page.getByRole("button", { name: "Enable administrator MFA" }).click();

  const recoveryCodes = page.getByTestId("mfa-recovery-code");
  await expect(recoveryCodes).toHaveCount(10);
  const firstRecoveryCode = (await recoveryCodes.first().textContent())?.trim();
  expect(firstRecoveryCode).toBeTruthy();

  await page.getByRole("link", { name: "Continue to Admin" }).click();
  await expect(page.getByRole("heading", { name: "Admin · Overview" })).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, adminEmail, adminPassword);
  await page.goto("/admin");
  await page.waitForURL(/\/account\/admin-mfa/);
  await expect(page.getByRole("heading", { name: "Administrator verification" })).toBeVisible();
  await page.getByLabel("Verification code").fill(firstRecoveryCode!);
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await page.waitForURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Admin · Overview" })).toBeVisible();

  await page.getByRole("link", { name: "Support", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Admin · Support" })).toBeVisible();
});
