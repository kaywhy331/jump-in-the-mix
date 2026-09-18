import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

// These regressions mutate only disposable local fixtures.
const database = new URL(process.env.DATABASE_URL ?? "postgresql://localhost/unknown");
const isolated = ["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname.startsWith("/jitm_design_");
test.skip(!isolated, "Readiness regression fixtures require a disposable local database.");
let workspaceId: string;
let contactId: string;
let duplicateId: string;
let groups: string[] = [];
const suffix = randomUUID();
const name = `Readiness ${suffix}`;

test.beforeAll(async () => {
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "demo@jumpinthemix.local" }, include: { memberships: true } });
  workspaceId = owner.memberships[0].workspaceId;
  for (const label of ["First", "Second"]) {
    const group = await prisma.group.create({ data: { workspaceId, name: `${label} ${suffix}` } }); groups.push(group.id);
  }
  const contact = await prisma.contact.create({ data: { workspaceId, displayName: name, firstName: name, emails: { create: { email: `${suffix}@example.test`, normalized: `${suffix}@example.test`, isPrimary: true } }, groupMemberships: { create: groups.map(groupId => ({ groupId })) } } });
  contactId = contact.id;
  const duplicate = await prisma.contact.create({ data: { workspaceId, displayName: `${name} duplicate`, firstName: `${name} duplicate`, emails: { create: { email: `${suffix}@example.test`, normalized: `${suffix}@example.test`, isPrimary: true } } } });
  duplicateId = duplicate.id;
});
test.afterAll(async () => {
  if (!workspaceId) return;
  await prisma.contact.deleteMany({ where: { workspaceId, id: { in: [contactId, duplicateId].filter(Boolean) } } });
  await prisma.group.deleteMany({ where: { workspaceId, id: { in: groups } } });
  await prisma.mix.deleteMany({ where: { workspaceId, name: `Audience-free draft ${suffix}` } });
});
test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("demo@jumpinthemix.local");
  await page.getByLabel("Password", { exact: true }).fill("JumpInTheMix123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/jumps/);
});

test("invalid contact details retain the entire draft and can be corrected", async ({ page }) => {
  await page.goto("/contacts/new");
  await page.getByLabel("First name", { exact: true }).fill("Retained name");
  await page.getByLabel("Phone", { exact: true }).fill("not-a-phone");
  await page.getByRole("button", { name: "Save contact", exact: true }).click();
  await expect(page.locator("#contact-save-error")).toContainText("Invalid phone number");
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue("Retained name");
  await expect(page.getByLabel("Phone", { exact: true })).toHaveValue("not-a-phone");
  await page.getByLabel("Phone", { exact: true }).fill("+12025550189");
  await page.getByRole("button", { name: "Save contact", exact: true }).click();
  await page.waitForURL(/\/contacts\/[^/?]+\?created=1/);
  const id = new URL(page.url()).pathname.split("/").at(-1)!;
  await prisma.contact.deleteMany({ where: { id, workspaceId, firstName: "Retained name" } });
});

test("contact navigation asks before discarding edits", async ({ page }) => {
  await page.goto(`/contacts/${contactId}/edit`);
  await page.getByLabel("First name", { exact: true }).fill("Keep my edit");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("link", { name: "Back to Contact", exact: true }).click();
  await expect(page.getByLabel("First name", { exact: true })).toHaveValue("Keep my edit");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("link", { name: "Back to Contact", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/contacts/${contactId}$`));
});

test("overlapping tags count one recipient and only that audience's missing methods", async ({ page }) => {
  // Use the signed-in browser: production Secure cookies on loopback HTTP are
  // accepted by Chromium, but not by Playwright's separate request client.
  const response = await page.evaluate(async path => { const result = await fetch(path); return { status: result.status, data: await result.json() }; }, `/api/contacts/audience?${new URLSearchParams(groups.map(id => ["group", id]))}`);
  expect(response.status).toBe(200);
  expect(response.data).toEqual({ total: 1, missingEmail: 0, missingPhone: 1 });
  await page.goto("/templates/mix_relationship_next_verse/use");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  for (const id of groups) await page.locator(`input[name="groupIds"][value="${id}"]`).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".import-summary-grid > div").first()).toHaveText("1people");
});

test("a template can be saved as a draft before choosing people", async ({ page }) => {
  await page.goto("/templates/mix_relationship_next_verse/use");
  await page.getByLabel("Mix name", { exact: true }).fill(`Audience-free draft ${suffix}`);
  await page.getByLabel("After setup", { exact: true }).selectOption("DRAFT");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.waitForURL(/\/mixes\/[^/]+\/edit\?imported=1/);
  const saved = await prisma.mix.findFirstOrThrow({ where: { workspaceId, name: `Audience-free draft ${suffix}` }, include: { assignments: true } });
  expect(saved.status).toBe("DRAFT");
  expect(saved.assignments).toHaveLength(0);
});

test("the second duplicate can be chosen as survivor", async ({ page }) => {
  await page.goto("/contacts/duplicates");
  const pair = page.locator(".duplicate-pair").filter({ has: page.getByRole("heading", { name, exact: true }) });
  const select = pair.getByRole("combobox");
  const second = await select.locator("option").nth(1).getAttribute("value");
  const first = await select.locator("option").first().getAttribute("value");
  await select.selectOption(second!);
  const sourceName = first === contactId ? name : `${name} duplicate`;
  await pair.getByRole("textbox").fill(sourceName);
  await pair.getByRole("button", { name: "Merge contacts", exact: true }).click();
  await page.waitForURL(new RegExp(`/contacts/${second}`));
  expect((await prisma.contact.findUniqueOrThrow({ where: { id: second! } })).archivedAt).toBeNull();
  expect((await prisma.contact.findUniqueOrThrow({ where: { id: first! } })).archivedAt).not.toBeNull();
});
