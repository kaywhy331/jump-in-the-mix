import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

const userEmail = process.env.E2E_USER_EMAIL ?? "demo@jumpinthemix.local";
const userPassword = process.env.E2E_USER_PASSWORD ?? "JumpInTheMix123!";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(userEmail);
  await page.getByLabel("Password", { exact: true }).fill(userPassword);
  await Promise.all([
    page.waitForURL(/\/(jumps|onboarding)(\?|$)/),
    page.getByRole("button", { name: "Sign in" }).click()
  ]);
}

test("Contact search is bounded, announced, and paginated", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Pagination is exercised once.");
  const prefix = `Paged Contact ${Date.now()} ${Math.random().toString(36).slice(2)}`;
  const workspaceId = "demo_workspace";
  const ids = Array.from({ length: 55 }, (_, index) => `e2e-page-contact-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`);
  await prisma.contact.createMany({
    data: ids.map((id, index) => ({ id, workspaceId, displayName: `${prefix} ${String(index).padStart(2, "0")}`, firstName: "Paged" }))
  });

  try {
    await signIn(page);
    await page.goto(`/contacts?q=${encodeURIComponent(prefix)}`);
    await expect(page.getByRole("status")).toContainText("55 Contacts found");
    await expect(page.locator(".contact-row")).toHaveCount(50);
    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator(".contact-row")).toHaveCount(5);
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
  } finally {
    await prisma.contact.deleteMany({ where: { id: { in: ids }, workspaceId } });
  }
});

test("queued imports remain visible after navigation and expose their terminal or cancelable state", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Import resume is exercised once.");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const importId = `import-e2e-${suffix}`;
  const sourceFileName = `resume-test-${suffix}.csv`;

  await signIn(page);
  await page.goto("/contacts/import");
  await expect(page.getByText("Choose file", { exact: true })).toBeVisible();
  await expect(page.getByText("Review issues", { exact: true })).toBeVisible();
  await expect(page.getByText("Results", { exact: true })).toBeVisible();

  const queued = await page.evaluate(async ({ importId: id, suffix: value, sourceFileName: fileName }) => {
    const response = await fetch("/api/contacts/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "queue",
        importId: id,
        sourceFileName: fileName,
        items: [{
          record: {
            rowId: `row-${value}`,
            sourceRow: 2,
            source: "CSV",
            firstName: "Resume",
            lastName: "Tester",
            displayName: `Resume Tester ${value}`,
            company: null,
            publicNotes: null,
            emails: [],
            phones: [],
            addresses: [],
            groupIds: [],
            customFields: [],
            jumpDates: []
          },
          resolution: { rowId: `row-${value}`, action: "CREATE", targetContactId: null }
        }],
        initialResults: []
      })
    });
    return response.json();
  }, { importId, suffix, sourceFileName });
  expect(queued.batch?.status).toBe("QUEUED");

  await page.goto("/contacts");
  await page.goto("/contacts/import");
  const recent = page.getByRole("button", { name: new RegExp(sourceFileName) });
  await expect(recent).toBeVisible();
  await recent.click();
  await expect(page.locator(".import-stage-heading").getByText(sourceFileName, { exact: false })).toBeVisible();
  const currentImport = page.locator("section.import-stage").filter({ has: page.getByRole("heading", { name: "Import results" }) });
  const cancel = page.getByRole("button", { name: "Cancel import" });
  if (await cancel.isVisible()) {
    await cancel.click();
    const terminalState = currentImport.getByText(/canceled|completed|partial/, { exact: true });
    await expect(terminalState).toBeVisible();
    if ((await terminalState.textContent()) !== "canceled") {
      await expect(currentImport.getByRole("link", { name: "View imported Contacts" })).toBeVisible();
    }
  } else {
    await expect(currentImport.getByText(/completed|partial/, { exact: true })).toBeVisible();
    await expect(currentImport.getByRole("link", { name: "View imported Contacts" })).toBeVisible();
  }

  const batch = await prisma.contactImportBatch.findUnique({ where: { workspaceId_importId: { workspaceId: "demo_workspace", importId } } });
  if (batch) {
    await prisma.job.deleteMany({ where: { workspaceId: "demo_workspace", task: "contact-import", payload: { path: ["batchId"], equals: batch.id } } });
    await prisma.contactImportBatch.delete({ where: { id: batch.id } });
  }
});

test("import review counts the rows with no phone or email and asks before queueing them", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "The import review is exercised once.");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const csv = [
    "First Name,Last Name,Cell Phone",
    `Missing,One ${suffix},`,
    `Missing,Two ${suffix},`,
    `Reachable,Person ${suffix},(555) 234-5678`
  ].join("\n");

  await signIn(page);
  await page.goto("/contacts/import");
  await page.locator('input[type="file"]').setInputFiles({ name: `no-methods-${suffix}.csv`, mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByRole("heading", { name: "Review issues" })).toBeVisible();

  // The warning is on screen before anything is queued, and its control opens the mapping editor.
  const warning = page.getByRole("status").filter({ hasText: "2 of 3 rows have no phone or email" });
  await expect(warning).toBeVisible();
  const cellPhoneMapping = page.locator(".import-mapping-row").filter({ hasText: "Cell Phone" }).getByRole("combobox");
  await expect(cellPhoneMapping).toBeHidden();
  await warning.getByRole("button", { name: "Check field mapping" }).click();
  await expect(cellPhoneMapping).toBeVisible();
  await expect(cellPhoneMapping).toHaveValue("field:phone");

  // More than half the rows lack a contact method, so Queue asks first; Go back queues nothing.
  await page.getByRole("button", { name: "Queue 3 valid rows", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Most rows have no phone or email" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("2 of 3 rows have no phone or email");
  await dialog.getByRole("button", { name: "Go back" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Review issues" })).toBeVisible();
  expect(await prisma.contact.count({ where: { workspaceId: "demo_workspace", lastName: { contains: suffix } } })).toBe(0);
});
