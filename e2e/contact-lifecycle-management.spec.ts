import { expect, test, type Page } from "@playwright/test";
import { normalizePhone } from "../src/lib/contact-input";
import { prisma } from "../src/lib/prisma";

const userEmail = process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local";
const userPassword = process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(userEmail);
  await page.getByLabel("Password", { exact: true }).fill(userPassword);
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

test("Undo after archiving survives a double tap", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The archive Undo is exercised once.");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId = "demo_workspace";
  const contactId = `e2e-undo-${suffix}`;
  await prisma.contact.create({ data: { id: contactId, workspaceId, displayName: `Undo Person ${suffix}`, firstName: "Undo", archivedAt: new Date() } });

  try {
    await signIn(page);
    await page.goto(`/contacts?archived=1&archivedContact=${encodeURIComponent(contactId)}`);
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    await expect(undo).toBeVisible();
    await Promise.all([
      page.waitForURL(/restored=1/),
      undo.dblclick()
    ]);
    await expect(page.locator(".notice.success")).toHaveCount(1);
    await expect(page.locator(".notice.success")).toHaveText("Contact restored.");
    await expect(page.locator(".notice.error")).toHaveCount(0);
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: contactId } })).archivedAt).toBeNull();
  } finally {
    await prisma.contact.deleteMany({ where: { workspaceId, id: contactId } });
  }
});

test("Deleting a tag names the tag and warns when Mixes run for its people", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Tag deletion copy is exercised once.");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId = "demo_workspace";
  const groupId = `e2e-tag-${suffix}`;
  const tagName = `Spring maintenance ${suffix}`;
  await prisma.group.create({ data: { id: groupId, workspaceId, name: tagName } });
  await prisma.mixAssignment.create({ data: { assignmentKey: `${workspaceId}:demo_mix_relationship:group:${groupId}`, workspaceId, mixId: "demo_mix_relationship", groupId, mode: "DYNAMIC" } });

  try {
    await signIn(page);
    await page.goto("/contacts");
    await page.getByRole("button", { name: "More contact tools" }).click();
    const tools = page.getByRole("dialog", { name: "Contact tools" });
    await tools.getByRole("button", { name: `Delete the ${tagName} tag`, exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: `Delete ${tagName}?` });
    await expect(confirmation).toContainText("1 Mix runs for this tag's people and will stop for them.");
    await expect(confirmation).toContainText("People and completed history will stay in your account.");
    await confirmation.getByRole("button", { name: "Cancel" }).click();
    await expect(confirmation).toBeHidden();
    expect(await prisma.group.count({ where: { id: groupId } })).toBe(1);
  } finally {
    await prisma.group.deleteMany({ where: { workspaceId, id: groupId } });
  }
});

test("Phone search finds a number however it was typed", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Phone search is exercised once.");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId = "demo_workspace";
  const contactId = `e2e-phone-search-${suffix}`;
  const displayName = `Phone Search ${suffix}`;
  const phone = "(555) 123-4567";
  await prisma.contact.create({ data: { id: contactId, workspaceId, displayName, firstName: "Phone", phones: { create: { phone, normalized: normalizePhone(phone) ?? phone, isPrimary: true } } } });

  try {
    await signIn(page);
    for (const query of ["555-123-4567", "5551234567"]) {
      await page.goto(`/contacts?q=${encodeURIComponent(query)}`);
      await expect(page.locator(".contact-row").filter({ hasText: displayName })).toBeVisible();
    }
    await prisma.contact.update({ where: { id: contactId }, data: { archivedAt: new Date() } });
    await page.goto(`/contacts/archived?q=${encodeURIComponent("555.123.4567")}`);
    await expect(page.locator(".contact-row").filter({ hasText: displayName })).toBeVisible();
  } finally {
    await prisma.contact.deleteMany({ where: { workspaceId, id: contactId } });
  }
});
