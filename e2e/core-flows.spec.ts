import { expect, test, type Page } from "@playwright/test";
import { generateTotpCode } from "../src/lib/totp";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { formatDateTime } from "../src/lib/format";
import { logicalDateInTimezone, logicalDateKey } from "../src/lib/jump-schedule";
import { createPendingJumpFixture, removePendingJumpFixture } from "./pending-jump-fixture";

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

test("single user can complete the primary discovery and support journey", async ({ page }, testInfo) => {
  const pendingJumpId = await createPendingJumpFixture(`Discovery journey ${testInfo.project.name}`);
  try {
  await signIn(page, userEmail, userPassword);

  await page.goto("/jumps");
  await expect(page.getByRole("heading", { name: "Today", exact: true }).first()).toBeVisible();
  await expect(page.locator(`[data-jump-workflow="${pendingJumpId}"]:visible`)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Filter/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /This week:/ })).toBeVisible();

  await page.goto("/contacts");
  await expect(page.getByRole("heading", { name: "Contacts", exact: true })).toBeVisible();
  await page.getByLabel("More contact tools").click();
  const contactTools = page.getByRole("dialog", { name: "Contact tools" });
  await expect(contactTools.getByRole("heading", { name: "Tags" })).toBeVisible();
  await expect(contactTools.getByRole("link", { name: "Import contacts" })).toBeVisible();
  await expect(contactTools.getByText(/Google Contacts/)).toHaveCount(0);
  await page.getByLabel("Close Contact tools").click();
  await expect(contactTools).toBeHidden();
  await page.getByRole("button", { name: /^Filter/ }).click();
  const contactFilters = page.getByRole("dialog", { name: "Filter contacts" });
  await expect(contactFilters.getByLabel("Tag")).toBeVisible();
  await page.getByLabel("Close Filter contacts").click();
  await page.getByRole("link", { name: "Add", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add a contact" })).toBeVisible();

  await page.goto("/templates");
  await expect(page.getByRole("heading", { name: "Ready-made mixes" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search ready-made mixes" }).fill("Estimate sent");
  await expect(page.getByText("Estimate sent: gentle follow-up", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create a mix" })).toHaveAttribute("href", "/mixes/new?custom=1");

  await page.goto("/mixes/new?custom=1");
  await expect(page.getByRole("heading", { name: "Create a mix" })).toBeVisible();
  await expect(page.getByLabel("Mix name")).toBeVisible();

  const ticketTitle = `E2E browser support ticket ${testInfo.project.name}`;
  await page.goto("/help");
  await expect(page.getByRole("heading", { name: "Help", exact: true })).toBeVisible();
  const supportForm = page.locator("#contact-support form");
  if (testInfo.project.name === "mobile-chromium") {
    await expect(supportForm.getByRole("button", { name: "Send to support" })).toBeVisible();
    return;
  }
  await supportForm.getByLabel("Topic").selectOption("GENERAL");
  await supportForm.getByLabel("Short title").fill(ticketTitle);
  await supportForm.getByLabel("What happened?").fill("Browser coverage is verifying that a private support conversation can be submitted and opened.");
  await Promise.all([
    page.waitForURL(/\/account\/tickets\//),
    supportForm.getByRole("button", { name: "Send to support" }).click()
  ]);
  await expect(page.getByRole("heading", { name: ticketTitle })).toBeVisible();
  } finally {
    await removePendingJumpFixture(pendingJumpId);
  }
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
  await page.getByRole("button", { name: "More contact tools" }).click();
  const tools = page.getByRole("dialog", { name: "Contact tools" });
  await tools.getByRole("button", { name: /Pick from device/ }).click();
  await expect(tools.getByText(/\d+ added · \d+ merged/)).toBeVisible();
});

test("new customer reaches a prepared first Jump through onboarding", async ({ page }) => {
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
          profile: { create: { onboardingDone: false } }
        }
      }
    }
  });

  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole("heading", { name: "Jump in the mix." })).toBeVisible();
  await page.getByLabel("Business name").fill("Browser Test Plumbing");
  await page.getByLabel("Name", { exact: true }).fill("Jordan First Win");
  await page.getByLabel("Email optional").fill("jordan-first-win@example.com");
  await page.getByLabel("Phone recommended").fill("+1 (555) 010-0123");
  await page.getByLabel("What should you remember?").selectOption("Follow up about an estimate");
  await page.getByRole("button", { name: "Change", exact: true }).click();
  const timezonePicker = page.getByRole("dialog", { name: "Choose your city" });
  await timezonePicker.getByLabel("Search cities").fill("Chicago");
  await timezonePicker.getByRole("button", { name: /Chicago.*America\/Chicago/ }).click();
  const followUpDate = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("Follow up on").fill(followUpDate);
  await Promise.all([
    page.waitForURL(/\/jumps\?.*welcome=1/),
    page.getByRole("button", { name: "Prepare my first follow-up" }).click()
  ]);
  await expect(page.getByText("Your first follow-up for Jordan First Win is ready.")).toBeVisible();
  const firstFollowUp = page.locator(".jump-task-card:visible").filter({ hasText: "Jordan First Win" }).first();
  await expect(firstFollowUp).toBeVisible();
  await firstFollowUp.getByRole("button", { name: "Review message for Jordan First Win" }).click();
  const preparedMessage = firstFollowUp.getByLabel("Fine-tune before sending");
  await expect(preparedMessage).toBeVisible();
  const renderedBody = await preparedMessage.inputValue();
  expect(renderedBody).not.toContain("{{");
  expect(renderedBody).not.toContain("  ");
  expect(renderedBody?.trim()).toMatch(/Onboarding Browser Test$/);
  expect(renderedBody).toContain("received the estimate from Browser Test Plumbing");
  expect(renderedBody).not.toContain("working the way you expected");
  await expect(firstFollowUp.getByRole("link", { name: "Open text for Jordan First Win" })).toHaveAttribute("href", /^sms:\+1.*body=/);
  const firstJump = await prisma.jump.findFirstOrThrow({ where: { workspaceId }, orderBy: { scheduledAt: "asc" } });
  expect(logicalDateKey(logicalDateInTimezone(firstJump.scheduledAt, "America/Chicago"))).toBe(followUpDate);
  await expect(firstFollowUp).toContainText(formatDateTime(firstJump.scheduledAt, { timeZone: "America/Chicago", locale: "en-US" }));
  await expect(prisma.contactPhone.findFirst({ where: { contact: { workspaceId } } })).resolves.toMatchObject({ normalized: "+15550100123" });
  await expect(prisma.contact.count({ where: { workspaceId, displayName: "Jordan First Win" } })).resolves.toBe(1);
  await expect(prisma.jump.count({ where: { workspaceId, contact: { displayName: "Jordan First Win" } } })).resolves.toBeGreaterThan(0);
});

test("personal account holder must reauthenticate and explicitly confirm permanent deletion", async ({ page }, testInfo) => {
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
  await page.goto("/account?section=privacy");
  const dangerZone = page.getByRole("region", { name: "Permanently delete account" });
  await expect(dangerZone.getByRole("heading", { name: "Permanently delete account" })).toBeVisible();

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

    const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail }, select: { id: true } });
    await prisma.$transaction([
      prisma.adminMfaSession.deleteMany({ where: { userId: adminUser.id } }),
      prisma.adminMfaCredential.deleteMany({ where: { userId: adminUser.id } }),
      prisma.session.deleteMany({ where: { userId: adminUser.id } })
    ]);
    await page.context().clearCookies();

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

    const customer = await prisma.user.findUniqueOrThrow({ where: { email: userEmail } });
    const handler = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
    const membership = await prisma.workspaceMember.findFirstOrThrow({ where: { userId: customer.id } });
    const ticket = await prisma.supportTicket.create({ data: { reference: `CORE-${Date.now()}`, title: "Investigate follow-up queue", category: "JUMPS", workspaceId: membership.workspaceId, requesterUserId: customer.id, assignedToUserId: handler.id } });
    await page.goto(`/admin/support/${ticket.id}`);
    await page.getByRole("textbox", { name: "Support reason", exact: true }).fill("E2E verification of the centrally enforced view-only mutation boundary.");
    await page.getByRole("button", { name: "Start view-only session" }).click();
    await expect(page.locator(".impersonation-banner")).toContainText("view-only");

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
      page.waitForURL(/\/admin\/support\?impersonationEnded=1/),
      page.getByRole("button", { name: "End view-only session" }).first().click()
    ]);
    await expect(page.getByText("The view-only support session has ended.")).toBeVisible();
    await prisma.supportTicket.delete({ where: { id: ticket.id } });
  });
});
