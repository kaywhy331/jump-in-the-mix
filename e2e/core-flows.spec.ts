import { expect, test, type Page } from "@playwright/test";
import { generateTotpCode } from "../src/lib/totp";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

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
  await expect(page.getByRole("heading", { name: "Today", exact: true }).first()).toBeVisible();
  await expect(page.locator(".jump-task-card").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Due" })).toBeVisible();

  await page.goto("/contacts");
  await expect(page.getByRole("heading", { name: "Contacts", exact: true })).toBeVisible();
  const groupManager = page.locator("details.group-manager").filter({ hasText: "Manage groups" });
  await groupManager.locator("summary").click();
  await expect(groupManager.getByText("3/10 active · 3 stored", { exact: true })).toBeVisible();
  await expect(groupManager.getByRole("button", { name: "Save active selection" })).toBeVisible();
  await groupManager.evaluate((element) => { (element as HTMLDetailsElement).open = false; });
  await page.locator("summary").filter({ hasText: "+ Add Contact" }).click();
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
  const supportForm = page.locator("#contact-support form");
  await supportForm.getByLabel("Topic").selectOption("GENERAL");
  await supportForm.getByLabel("Ticket title").fill(ticketTitle);
  await supportForm.getByLabel("What happened?").fill("Browser coverage is verifying that a private support conversation can be submitted and opened.");
  await Promise.all([
    page.waitForURL(/\/account\/tickets\//),
    supportForm.getByRole("button", { name: "Submit support ticket" }).click()
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
  await expect(page.getByRole("heading", { name: "Contacts", exact: true })).toBeVisible();
  const addPanel = page.locator("details").filter({ has: page.locator(".contact-add-panel") });
  await addPanel.evaluate((element) => { (element as HTMLDetailsElement).open = true; });
  await page.getByRole("button", { name: /Pick from device/ }).click();
  await expect(page.getByText(/\d+ added · \d+ merged/)).toBeVisible();
});

test("new customer reaches a prepared first Jump through onboarding", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The stateful first-win journey runs once.");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const userId = `e2e-onboarding-user-${suffix}`;
  const workspaceId = `e2e-onboarding-workspace-${suffix}`;
  const email = `e2e-onboarding-${suffix}@jumpinthemix.local`;
  const password = "OnboardingTest123!";
  await prisma.user.create({
    data: {
      id: userId,
      email,
      name: "Onboarding Browser Test",
      passwordHash: await bcrypt.hash(password, 4),
      emailVerifiedAt: new Date(),
      ownedWorkspaces: {
        create: {
          id: workspaceId,
          name: "Onboarding Browser Workspace",
          slug: `e2e-onboarding-${suffix}`,
          members: { create: { userId, role: "OWNER" } },
          profile: { create: { onboardingDone: false, timezone: "America/Los_Angeles" } }
        }
      }
    }
  });

  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole("heading", { name: "Who would you like to remember?" })).toBeVisible();
  await page.getByLabel("Name").fill("Jordan First Win");
  await page.getByLabel("Email optional").fill("jordan-first-win@example.com");
  await Promise.all([
    page.waitForURL(/\/jumps\?.*welcome=1/),
    page.getByRole("button", { name: "Create my first Jump" }).click()
  ]);
  await expect(page.getByText("Your first Jump for Jordan First Win is ready below.")).toBeVisible();
  await expect(page.locator(".jump-task-card").filter({ hasText: "Jordan First Win" }).first()).toBeVisible();
  await expect(prisma.contact.count({ where: { workspaceId, displayName: "Jordan First Win" } })).resolves.toBe(1);
  await expect(prisma.jump.count({ where: { workspaceId, contact: { displayName: "Jordan First Win" } } })).resolves.toBeGreaterThan(0);
});

test("account owner must reauthenticate and explicitly confirm permanent deletion", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The destructive stateful journey runs once.");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const userId = `e2e-delete-user-${suffix}`;
  const workspaceId = `e2e-delete-workspace-${suffix}`;
  const email = `e2e-delete-${suffix}@jumpinthemix.local`;
  const password = "DeleteAccountTest123!";
  await prisma.user.create({
    data: {
      id: userId,
      email,
      name: "Deletion Browser Test",
      passwordHash: await bcrypt.hash(password, 4),
      emailVerifiedAt: new Date(),
      ownedWorkspaces: {
        create: {
          id: workspaceId,
          name: "Deletion Browser Workspace",
          slug: `e2e-delete-${suffix}`,
          members: { create: { userId, role: "OWNER" } },
          profile: { create: { onboardingDone: true } },
          contacts: { create: { displayName: "Deletion Residue Contact" } },
          jobs: { create: { task: "generate-jumps", payload: {}, runAt: new Date(Date.now() + 60_000) } }
        }
      },
      sessions: {
        create: { tokenHash: `e2e-delete-extra-${suffix}`, expiresAt: new Date(Date.now() + 60_000) }
      }
    }
  });

  await signIn(page, email, password);
  await page.goto("/account");
  const dangerZone = page.getByRole("region", { name: "Permanently delete account" });
  await expect(dangerZone.getByText("Danger Zone")).toBeVisible();

  await dangerZone.getByLabel("Current password").fill("wrong-password");
  await dangerZone.getByLabel(/Type DELETE MY ACCOUNT/).fill("DELETE MY ACCOUNT");
  await dangerZone.getByRole("button", { name: "Permanently delete account" }).click();
  await expect(dangerZone.getByRole("alert")).toContainText("current password is incorrect");

  await dangerZone.getByLabel("Current password").fill(password);
  await dangerZone.getByLabel(/Type DELETE MY ACCOUNT/).fill("delete my account");
  await dangerZone.getByRole("button", { name: "Permanently delete account" }).click();
  await expect(dangerZone.getByRole("alert")).toContainText("Type DELETE MY ACCOUNT exactly");

  await dangerZone.getByLabel("Current password").fill(password);
  await dangerZone.getByLabel(/Type DELETE MY ACCOUNT/).fill("DELETE MY ACCOUNT");
  await Promise.all([
    page.waitForURL(/\/account\/deleted$/),
    dangerZone.getByRole("button", { name: "Permanently delete account" }).click()
  ]);
  await expect(page.getByRole("heading", { name: "Your Jump in the Mix account has been deleted." })).toBeVisible();
  await expect(prisma.user.findUnique({ where: { id: userId } })).resolves.toBeNull();
  await expect(prisma.session.count({ where: { userId } })).resolves.toBe(0);
  await expect(prisma.workspace.count({ where: { id: workspaceId } })).resolves.toBe(0);
  await expect(prisma.contact.count({ where: { workspaceId } })).resolves.toBe(0);
  await expect(prisma.job.count({ where: { workspaceId } })).resolves.toBe(0);
});

test.describe("stateful administrator security journey", () => {
  test.describe.configure({ retries: 0 });

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

    await page.goto("/admin/users");
    const targetCard = page.locator(".admin-user-card").filter({ hasText: userEmail });
    await targetCard.locator("summary").filter({ hasText: "View account" }).click();
    await targetCard.getByLabel("Support reason").fill("E2E verification of the centrally enforced view-only mutation boundary.");
    await Promise.all([
      page.waitForURL(/\/jumps\?impersonating=1/),
      targetCard.getByRole("button", { name: "Start 30-minute view-only session" }).click()
    ]);
    await expect(page.getByText("View-only support session", { exact: true }).first()).toBeVisible();

    const blockedMutation = await page.evaluate(async () => {
      const response = await fetch("/api/contacts/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: "e2e-impersonation-write", contacts: [] })
      });
      return { status: response.status, body: await response.text() };
    });
    expect(blockedMutation.status).toBe(403);
    expect(blockedMutation.body).toContain("view-only");

    await Promise.all([
      page.waitForURL(/\/admin\/users\?impersonationEnded=1/),
      page.getByRole("button", { name: "End view-only session" }).first().click()
    ]);
    await expect(page.getByText("The view-only support session has ended.")).toBeVisible();
  });
});
