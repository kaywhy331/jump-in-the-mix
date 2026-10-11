import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

const userEmail = process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local";
const userPassword = process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!";
const workspaceId = "demo_workspace";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(userEmail);
  await page.getByLabel("Password", { exact: true }).fill(userPassword);
  await Promise.all([
    page.waitForURL(/\/(jumps|onboarding)(\?|$)/),
    page.getByRole("button", { name: "Sign in" }).click()
  ]);
}

const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The Release A2 contact checks run once, in the docked desktop layout.");
  await signIn(page);
});

test("an archived contact's link shows when it was archived and restores back to that person", async ({ page }) => {
  const suffix = unique();
  const contactId = `e2e-a2-archived-${suffix}`;
  const displayName = `Archived Person ${suffix}`;
  await prisma.contact.create({ data: { id: contactId, workspaceId, displayName, firstName: "Archived", archivedAt: new Date() } });
  try {
    await page.goto(`/contacts/${contactId}`);
    await expect(page.getByRole("heading", { level: 1, name: displayName })).toBeVisible();
    await expect(page.locator(".notice.info").filter({ hasText: "Archived on" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Archived contacts", exact: true })).toHaveAttribute("href", "/contacts/archived");
    await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveCount(0);
    await Promise.all([
      page.waitForURL(new RegExp(`/contacts/${contactId}\\?restored=1$`)),
      page.getByRole("button", { name: "Restore contact", exact: true }).click()
    ]);
    await expect(page.getByText("Contact restored.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: displayName })).toBeVisible();
    expect((await prisma.contact.findUniqueOrThrow({ where: { id: contactId } })).archivedAt).toBeNull();
  } finally {
    await prisma.contact.deleteMany({ where: { workspaceId, id: contactId } });
  }
});

test("bulk archive offers Undo that brings the selected people back", async ({ page }) => {
  const suffix = unique();
  const people = ["Bulk Undo Ana", "Bulk Undo Ben"].map((name, index) => ({ id: `e2e-a2-bulk-${index}-${suffix}`, workspaceId, displayName: `${name} ${suffix}`, firstName: name.split(" ")[2] }));
  await prisma.contact.createMany({ data: people });
  try {
    await page.goto(`/contacts?q=${encodeURIComponent(suffix)}`);
    await page.getByRole("button", { name: "More contact tools" }).click();
    await page.getByRole("dialog", { name: "Contact tools" }).getByRole("button", { name: "Select contacts" }).click();
    for (const person of people) await page.getByRole("checkbox", { name: `Select ${person.displayName}`, exact: true }).check();
    await page.getByRole("complementary", { name: "Actions for selected contacts" }).getByRole("button", { name: "Archive 2…" }).click();
    const confirmation = page.getByRole("dialog", { name: "Archive 2 selected contacts?" });
    await Promise.all([
      page.waitForURL(/bulkArchived=2&archivedContacts=/),
      confirmation.getByRole("button", { name: "Archive", exact: true }).click()
    ]);
    await expect(page.locator(".notice.success").filter({ hasText: "Contacts archived." })).toBeVisible();
    expect(await prisma.contact.count({ where: { id: { in: people.map((person) => person.id) }, archivedAt: { not: null } } })).toBe(2);

    await Promise.all([
      page.waitForURL(/\/contacts\?bulkRestored=2$/),
      page.getByRole("button", { name: "Undo", exact: true }).click()
    ]);
    await expect(page.getByText("Contacts restored.", { exact: true })).toBeVisible();
    expect(await prisma.contact.count({ where: { id: { in: people.map((person) => person.id) }, archivedAt: null } })).toBe(2);
  } finally {
    await prisma.contact.deleteMany({ where: { workspaceId, id: { in: people.map((person) => person.id) } } });
  }
});

test("a rejected email or phone is marked and focused in the Add and Edit forms", async ({ page }) => {
  const suffix = unique();
  const firstName = `Field ${suffix}`;
  const editId = `e2e-a2-fields-${suffix}`;
  await prisma.contact.create({ data: { id: editId, workspaceId, displayName: `Two Phones ${suffix}`, firstName: "Two", lastName: `Phones ${suffix}` } });
  try {
    await page.goto("/contacts/new");
    // The form states its own rule (at least one of name, company, email or phone), not the general required-fields note.
    await expect(page.getByText("Enter at least a name, company, email, or phone number.", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Everything is required unless marked optional.", { exact: true })).toHaveCount(0);
    await page.getByLabel("First name", { exact: true }).fill(firstName);
    await page.getByRole("button", { name: "Add another email" }).click();
    await page.locator("#quick-email-0").fill(`field-${suffix}@example.com`);
    // The browser accepts an address without a dot in the domain; the server does not.
    await page.locator("#quick-email-1").fill("second@example");
    await page.getByRole("button", { name: "Save contact", exact: true }).click();
    await expect(page.locator("#contact-save-error")).toContainText("Invalid email address: second@example");
    const second = page.locator("#quick-email-1");
    await expect(second).toBeFocused();
    await expect(second).toHaveAttribute("aria-invalid", "true");
    await expect(second).toHaveAttribute("aria-describedby", "contact-save-error");
    await expect(page.locator("#quick-email-0")).not.toHaveAttribute("aria-invalid", "true");
    await second.fill(`second-${suffix}@example.com`);
    await Promise.all([
      page.waitForURL(/\/contacts\/[^/?]+\?created=1/),
      page.getByRole("button", { name: "Save contact", exact: true }).click()
    ]);
    expect(await prisma.contact.count({ where: { workspaceId, firstName } })).toBe(1);

    await page.goto(`/contacts/${editId}/edit`);
    await page.getByLabel("Phone 1", { exact: true }).fill("(555) 010-7001");
    await page.getByRole("button", { name: "+ Add phone" }).click();
    await page.getByLabel("Phone 2", { exact: true }).fill("12");
    await page.getByRole("button", { name: "Update contact", exact: true }).click();
    await expect(page.locator("#contact-save-error")).toContainText("Invalid phone number: 12");
    const phone = page.getByLabel("Phone 2", { exact: true });
    await expect(phone).toBeFocused();
    await expect(phone).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Phone 1", { exact: true })).not.toHaveAttribute("aria-invalid", "true");
  } finally {
    await prisma.contact.deleteMany({ where: { workspaceId, OR: [{ firstName }, { id: editId }] } });
  }
});

test("Add contact's Back returns to the Journey it was opened from", async ({ page }) => {
  const returnTo = "/journey?mix=e2e-a2-mix&start=1";
  await page.goto(`/contacts/new?returnTo=${encodeURIComponent(returnTo)}`);
  const back = page.locator(".page-back-link");
  await expect(back).toHaveText("Journey");
  await expect(back).toHaveAttribute("href", returnTo);
  await expect(page.getByText("Save this person to return to your selected Mix.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cancel", exact: true })).toHaveAttribute("href", returnTo);

  await page.goto("/contacts/new");
  await expect(back).toHaveText("Contacts");
  await expect(back).toHaveAttribute("href", "/contacts");
});

test("choosing a person in the docked list moves focus into their profile", async ({ page }) => {
  const suffix = unique();
  const alpha = { id: `e2e-a2-focus-a-${suffix}`, workspaceId, displayName: `Focus Alpha ${suffix}`, firstName: "Focus" };
  const beta = { id: `e2e-a2-focus-b-${suffix}`, workspaceId, displayName: `Focus Beta ${suffix}`, firstName: "Focus" };
  await prisma.contact.createMany({ data: [alpha, beta] });
  try {
    await page.goto(`/contacts?q=${encodeURIComponent(suffix)}&sort=name`);
    const heading = page.locator("#contact-profile-heading");
    await expect(heading).toHaveText(alpha.displayName);
    await expect(heading).not.toBeFocused();

    const betaRow = page.getByRole("link", { name: beta.displayName, exact: true });
    await betaRow.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`person=${beta.id}`));
    await expect(heading).toHaveText(beta.displayName);
    await expect(heading).toBeFocused();

    // Enter on the person already shown moves focus into the profile too.
    await betaRow.focus();
    await page.keyboard.press("Enter");
    await expect(heading).toBeFocused();
  } finally {
    await prisma.contact.deleteMany({ where: { workspaceId, id: { in: [alpha.id, beta.id] } } });
  }
});

test("profile Mix controls carry the Mix name and the Journey track can be reached by keyboard", async ({ page }) => {
  const suffix = unique();
  const contactId = `e2e-a2-names-${suffix}`;
  const mix = await prisma.mix.findUniqueOrThrow({ where: { id: "demo_mix_relationship" }, select: { id: true, name: true } });
  await prisma.contact.create({ data: { id: contactId, workspaceId, displayName: `Named Controls ${suffix}`, firstName: "Named" } });
  await prisma.mixAssignment.create({ data: { assignmentKey: `${workspaceId}:${mix.id}:${contactId}`, workspaceId, mixId: mix.id, contactId } });
  const stage = await prisma.journeyStage.create({ data: { workspaceId, name: `E2E stage ${suffix}`, position: 9_999, isActive: false } });
  await prisma.contactJourney.create({ data: { workspaceId, contactId, stageId: stage.id } });
  try {
    await page.goto(`/contacts/${contactId}`);
    const track = page.getByRole("region", { name: "Recorded stage history and possible next stages" });
    await expect(track).toHaveAttribute("tabindex", "0");
    await track.focus();
    await expect(track).toBeFocused();

    // The Mix's row names it, and its menu, titled with the Mix, holds Stop and Remove (D77).
    await page.getByRole("button", { name: new RegExp(`^Options for ${mix.name}: `) }).click();
    const menu = page.getByRole("dialog", { name: mix.name, exact: true });
    await expect(menu.getByRole("button", { name: `Stop for Named Controls ${suffix}…`, exact: true })).toBeVisible();
    await expect(menu.getByRole("button", { name: "Remove from this Mix…", exact: true })).toBeVisible();
  } finally {
    await prisma.contact.deleteMany({ where: { workspaceId, id: contactId } });
    await prisma.journeyStage.deleteMany({ where: { id: stage.id } });
  }
});
