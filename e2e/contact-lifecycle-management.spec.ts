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

test("Contact state, archive restoration, duplicate review, and layout preferences are operable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Lifecycle management is exercised once.");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId = "demo_workspace";
  const activeId = `e2e-lifecycle-active-${suffix}`;
  const archivedId = `e2e-lifecycle-archived-${suffix}`;
  const duplicateId = `e2e-lifecycle-duplicate-${suffix}`;
  const displayName = `Lifecycle Person ${suffix}`;
  const duplicateName = `Duplicate Pair ${suffix}`;
  const demoUser = await prisma.user.findUniqueOrThrow({ where: { email: userEmail }, select: { id: true } });

  await prisma.contact.createMany({
    data: [
      { id: activeId, workspaceId, displayName, firstName: "Lifecycle", company: "Lifecycle Co" },
      { id: archivedId, workspaceId, displayName: `Archived ${suffix}`, firstName: "Archived", archivedAt: new Date() },
      { id: duplicateId, workspaceId, displayName: duplicateName, firstName: "Duplicate", company: "Shared Company" },
      { id: `${duplicateId}-2`, workspaceId, displayName: duplicateName, firstName: "Duplicate", company: "Shared Company" }
    ]
  });

  try {
    await signIn(page);
    await page.goto(`/contacts/${activeId}`);
    await expect(page.getByRole("heading", { name: "Relationship state" })).toBeVisible();
    await page.getByLabel("Priority").selectOption("URGENT");
    await page.getByLabel("Do not contact").check();
    await Promise.all([
      page.waitForURL(/stateUpdated=1/),
      page.getByRole("button", { name: "Save relationship state" }).click()
    ]);
    await expect(page.getByText("Do not contact is enabled")).toBeVisible();
    expect(await prisma.contactRelationshipState.findUniqueOrThrow({ where: { contactId: activeId } })).toMatchObject({ priority: "URGENT", doNotContact: true });

    const layoutResponse = await page.evaluate(async () => {
      const response = await fetch("/api/preferences/contact-layout", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order: ["relationship-state", "contact-summary"], collapsed: ["contact-summary"] })
      });
      return response.status;
    });
    expect(layoutResponse).toBe(204);
    expect(await prisma.userContactLayout.findUniqueOrThrow({ where: { userId_workspaceId: { userId: demoUser.id, workspaceId } } })).toMatchObject({ cardOrder: ["relationship-state", "contact-summary"], collapsedCards: ["contact-summary"] });

    await page.goto(`/contacts/archived?q=${encodeURIComponent(`Archived ${suffix}`)}`);
    await expect(page.getByText(`Archived ${suffix}`, { exact: true })).toBeVisible();
    await Promise.all([
      page.waitForURL(/restored=1/),
      page.getByRole("button", { name: "Restore Contact" }).click()
    ]);
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: archivedId } })).archivedAt).toBeNull();

    await page.goto("/contacts/duplicates");
    const duplicateCard = page.locator(".duplicate-pair").filter({ hasText: duplicateName });
    await expect(duplicateCard).toBeVisible();
    await expect(duplicateCard.getByRole("button", { name: "Merge Contacts" })).toBeVisible();
  } finally {
    await prisma.contactRelationshipState.deleteMany({ where: { contactId: activeId } });
    await prisma.userContactLayout.deleteMany({ where: { userId: demoUser.id, workspaceId } });
    await prisma.contact.deleteMany({ where: { workspaceId, id: { in: [activeId, archivedId, duplicateId, `${duplicateId}-2`] } } });
  }
});
