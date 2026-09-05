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

test("Contact state, archive restoration, and duplicate review are operable", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Lifecycle management is exercised once.");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId = "demo_workspace";
  const activeId = `e2e-lifecycle-active-${suffix}`;
  const archivedId = `e2e-lifecycle-archived-${suffix}`;
  const duplicateId = `e2e-lifecycle-duplicate-${suffix}`;
  const displayName = `Lifecycle Person ${suffix}`;
  const duplicateName = `Duplicate Pair ${suffix}`;

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
    await expect(page.getByRole("heading", { name: "Relationship" })).toBeVisible();
    await page.locator("label.relationship-chip").filter({ hasText: "Urgent" }).click();
    await expect(page).toHaveURL(/stateUpdated=1/);
    await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
    await expect.poll(async () => (await prisma.contactRelationshipState.findUniqueOrThrow({ where: { contactId: activeId } })).priority).toBe("URGENT");

    await page.getByLabel("Do not contact").check();
    await expect(page.getByLabel("Do not contact")).toBeChecked();
    await expect.poll(async () => await prisma.contactRelationshipState.findUniqueOrThrow({ where: { contactId: activeId } })).toMatchObject({ priority: "URGENT", doNotContact: true });

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
    await prisma.contact.deleteMany({ where: { workspaceId, id: { in: [activeId, archivedId, duplicateId, `${duplicateId}-2`] } } });
  }
});
