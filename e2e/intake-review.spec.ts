import { createHash, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { createConnectionToken } from "../src/lib/connection-tokens";
import { receiveIntake } from "../src/lib/intake";
import { createSupportFixture } from "../tests/helpers/support-fixture";
import { createAdminImpersonationGrant } from "../src/lib/impersonation";
import { axeInPage } from "./axe-in-page";

test.skip(!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? ""), "Disposable local database only");
test.use({ screenshot: "off", video: "off", trace: "off" });
let userId: string, workspaceId: string;
const token = randomUUID();
test.beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `daily-review-${randomUUID()}@example.test`, name: "Review fixture owner", emailVerifiedAt: new Date() } })).id;
  workspaceId = (await prisma.workspace.create({ data: { ownerId: userId, slug: randomUUID(), name: "Review fixture business", members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: true } } } })).id;
  await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
});
test.beforeEach(async ({ context }) => {
  await prisma.intakeConnection.deleteMany({ where: { workspaceId } });
  await prisma.contact.deleteMany({ where: { workspaceId } });
  await prisma.job.deleteMany({ where: { workspaceId } });
  await context.addCookies([{ name: "jitm_session", value: token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Strict" }]);
});
test.afterAll(async () => { await prisma.workspace.delete({ where: { id: workspaceId } }); await prisma.user.delete({ where: { id: userId } }); });
async function visit(page: Page, path: string) { await page.goto(path); await expect(page.locator("[data-browser-scope]")).not.toHaveAttribute("inert", ""); }
async function receipt(owner = workspaceId, archived = false) {
  const people = await Promise.all([0, 1].map(i => prisma.contact.create({ data: { workspaceId: owner, displayName: `Match ${i + 1}`, archivedAt: archived ? new Date("2026-10-01T12:00:00Z") : null, emails: { create: { email: "inquiry@example.test", normalized: "inquiry@example.test" } } } })));
  const connection = await prisma.intakeConnection.create({ data: { workspaceId: owner, kind: "CRM", name: "Website inquiries", ...createConnectionToken() } });
  const result = await receiveIntake(connection.id, { eventId: randomUUID(), displayName: "Incoming fixture", email: "inquiry@example.test", message: "Please call about a site visit." }, { tokenHash: connection.tokenHash });
  return { people, connection, result };
}

test("Today and Contacts count one ambiguous inquiry, preserve its receipt, and refresh after linking", async ({ page }) => {
  const f = await receipt();
  for (const path of ["/jumps", "/contacts"]) {
    await visit(page, path); await expect(page.locator(".needs-review-entry")).toHaveAttribute("data-review-count", "1");
    await expect(page.getByRole("link", { name: "Needs review · 1", exact: true })).toHaveAttribute("href", "/contacts/review");
    expect(await page.content()).not.toContain(f.connection.tokenEncrypted);
    await expect(page.getByLabel("Private key", { exact: true })).toHaveCount(0);
  }
  await page.getByRole("link", { name: "Needs review · 1", exact: true }).click();
  const panel = page.locator("#needs-review"), item = panel.locator("article");
  await expect(item).toHaveCount(1); await expect(item).toHaveAttribute("data-work-item-id", `${workspaceId}:receipt:${f.result.receiptId}`);
  await expect(panel).toContainText("New contacts waiting for a Mix are separate");
  await expect(panel).toContainText("Accepting this inquiry applies your matching journey rules.");
  await item.getByLabel("Matching contact").selectOption(f.people[0].id);
  await item.getByRole("button", { name: "Link to selected person", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Inquiry reviewed." })).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Needs review · 0", exact: true })).toBeVisible();
  expect(await prisma.contact.count({ where: { workspaceId } })).toBe(2);
  await page.getByRole("navigation", { name: "Review destinations" }).getByRole("link", { name: "Today", exact: true }).click();
  // Today shows Needs review only while an inquiry waits (UXA-02).
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(page.locator(".today-page-header")).toBeVisible();
  await expect(page.locator(".needs-review-entry")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(page.locator(".needs-review-entry")).toHaveAttribute("data-review-count", "0");
});

test("archived and disappeared matches keep explicit create and ignore choices", async ({ page }) => {
  const f = await receipt(workspaceId, true);
  await visit(page, `/contacts/review?receipt=${f.result.receiptId}`);
  const panel = page.locator("#needs-review");
  await expect(panel.getByRole("link", { name: "Restore them" })).toHaveAttribute("href", "/contacts/archived");
  await expect(panel.locator('select[name="contactId"] option')).toHaveCount(1);
  await panel.getByRole("button", { name: "Create a separate contact", exact: true }).click();
  await expect(panel).toContainText("Needs review · 0");
  expect(await prisma.contact.count({ where: { workspaceId, archivedAt: null } })).toBe(1);
  const next = await receiveIntake(f.connection.id, { eventId: randomUUID(), email: "inquiry@example.test" }, { tokenHash: f.connection.tokenHash });
  await prisma.contact.deleteMany({ where: { workspaceId } });
  await visit(page, `/contacts/review?receipt=${next.receiptId}`);
  await expect(panel).toContainText("No matching contact is available.");
  await panel.getByRole("button", { name: "Ignore inquiry", exact: true }).click();
  await expect(panel).toContainText("Needs review · 0");
  expect(await prisma.contact.count({ where: { workspaceId } })).toBe(0);
});

test("successful form creation reveals its actual preview, share link and destination before the creation form", async ({ page }) => {
  await visit(page, "/settings"); await page.getByRole("link", { name: /Lead sources/ }).click();
  await expect(page.getByRole("heading", { name: "Lead sources", exact: true })).toBeVisible();
  await page.getByLabel("Form name", { exact: true }).fill("Site visit form");
  await page.getByRole("button", { name: "Create shareable form", exact: true }).click();
  const setup = page.locator(".connection-setup[open]");
  await expect(setup).toContainText("Form created. Preview it and copy its link below.");
  const source = await prisma.intakeConnection.findFirstOrThrow({ where: { workspaceId, name: "Site visit form" } });
  const url = `${process.env.APP_URL}/lead/${source.id}`;
  await expect(setup.getByLabel("Form link", { exact: true })).toHaveValue(url);
  await expect(setup.getByRole("link", { name: "Open your form", exact: true })).toHaveAttribute("href", url);
  await expect(setup.getByLabel("New people from this connection")).toHaveValue("");
  expect(await setup.evaluate(el => Boolean(el.compareDocumentPosition(document.querySelector("#add-connection")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await setup.getByRole("link", { name: "Open your form", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Let’s get in touch" })).toBeVisible();
});

test("view-only support can inspect daily receipts without resolution controls being enabled", async ({ page, context }) => {
  const f = await createSupportFixture();
  try {
    await prisma.workspaceProfile.update({ where: { workspaceId: f.workspace.id }, data: { onboardingDone: true } });
    await prisma.supportTicket.update({ where: { id: f.ticket.id }, data: { assignedToUserId: f.admin.user.id } });
    const grant = await createAdminImpersonationGrant({ ...f.actor, ticketId: f.ticket.id, expectedRevision: 0, reason: "Inspect synthetic inquiry review controls." });
    await receipt(f.workspace.id);
    await context.clearCookies();
    await context.addCookies([{ name: "jitm_session", value: f.admin.token, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Lax" }, { name: "jitm_impersonation", value: grant.rawToken, url: process.env.APP_URL!, httpOnly: true, secure: true, sameSite: "Lax" }]);
    await visit(page, "/contacts"); await expect(page.locator(".needs-review-entry")).toHaveAttribute("data-review-count", "1");
    await page.getByRole("link", { name: "Needs review · 1", exact: true }).click({ timeout: 10000 });
    const panel = page.locator("#needs-review"); await expect(panel).toContainText("Inquiries can be read but not resolved.");
    for (const name of ["Link to selected person", "Create a separate contact", "Ignore inquiry"]) await expect(panel.getByRole("button", { name, exact: true })).toBeDisabled();
    await expect(panel.getByLabel("Matching contact")).toBeDisabled();
    await expect(page.getByLabel("Private key", { exact: true })).toHaveCount(0);
    expect(await prisma.intakeReceipt.count({ where: { connection: { workspaceId: f.workspace.id }, status: "REVIEW" } })).toBe(1);
  } finally { await f.cleanup(); }
});

test("daily review supports both themes, keyboard and enlarged text at phone width", async ({ page }) => {
  await receipt();
  for (const theme of ["light", "dark"]) {
    await visit(page, "/contacts/review");
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    const panel = page.locator("#needs-review"), select = panel.getByLabel("Matching contact");
    await expect(page.locator(".browser-account-gate")).not.toBeVisible();
    await expect(select).toBeVisible(); await expect(select).toBeEnabled();
    await select.focus(); await expect(select).toBeFocused(); await page.keyboard.press("Tab");
    await expect(panel.getByRole("button", { name: "Link to selected person", exact: true })).toBeFocused();
    expect((await axeInPage(page).include("#needs-review").withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { const sizes = [...document.querySelectorAll<HTMLElement>("#needs-review *")].map(el => ({ el, size: parseFloat(getComputedStyle(el).fontSize) })); for (const { el, size } of sizes) el.style.fontSize = `${size * 2}px`; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (const button of await panel.getByRole("button").all()) { const box = await button.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44); }
  }
});
