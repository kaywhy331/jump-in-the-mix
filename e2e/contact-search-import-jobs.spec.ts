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
    await page.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator(".contact-row")).toHaveCount(5);
    await expect(page.getByText("Page 2 of 2")).toBeVisible();
  } finally {
    await prisma.contact.deleteMany({ where: { id: { in: ids }, workspaceId } });
  }
});

test("queued imports remain visible after navigation and can be canceled", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Import resume is exercised once.");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const importId = `import-e2e-${suffix}`;

  await signIn(page);
  await page.goto("/contacts/import");
  await expect(page.getByText("Choose file", { exact: true })).toBeVisible();
  await expect(page.getByText("Review issues", { exact: true })).toBeVisible();
  await expect(page.getByText("Results", { exact: true })).toBeVisible();

  const queued = await page.evaluate(async ({ importId: id, suffix: value }) => {
    const response = await fetch("/api/contacts/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "queue",
        importId: id,
        sourceFileName: "resume-test.csv",
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
  }, { importId, suffix });
  expect(queued.batch?.status).toBe("QUEUED");

  await page.goto("/contacts");
  await page.goto("/contacts/import");
  await expect(page.getByText("Import is running")).toBeVisible();
  await expect(page.getByText("resume-test.csv", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Cancel import" }).click();
  await expect(page.getByText("canceled", { exact: true })).toBeVisible();

  const batch = await prisma.contactImportBatch.findUnique({ where: { workspaceId_importId: { workspaceId: "demo_workspace", importId } } });
  if (batch) {
    await prisma.job.deleteMany({ where: { workspaceId: "demo_workspace", task: "contact-import", payload: { path: ["batchId"], equals: batch.id } } });
    await prisma.contactImportBatch.delete({ where: { id: batch.id } });
  }
});
