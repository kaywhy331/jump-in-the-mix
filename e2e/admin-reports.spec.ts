import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "../src/lib/prisma";
import { createReportFixture } from "../tests/helpers/report-fixture";
import { clearRateLimit } from "../src/lib/rate-limit";
import { readFile } from "node:fs/promises";
import { runReportExport } from "../src/lib/report-exports";
import { runReportSnapshot } from "../src/lib/report-snapshots";
import { reportDefinitionKey, REPORT_SNAPSHOT_TASK } from "../src/lib/report-storage-policy";

const enabled = process.env.REPORTS_E2E === "1" && process.env.AUTH_REQUIRE_ADMIN_MFA === "true" && /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
test.skip(!enabled, "Requires disposable report fixtures and administrator MFA.");
test.use({ screenshot: "off", video: "off", trace: "off", actionTimeout: 20_000 });
let fixture: Awaited<ReturnType<typeof createReportFixture>>;
const snapshotIds: string[] = [], jobIds: string[] = [];
let originalStorage: Awaited<ReturnType<typeof prisma.reportStorageObservation.findUnique>>, storageDay: Date;
async function session(userId: string, mfa = true) {
  const token = randomBytes(32).toString("base64url");
  const row = await prisma.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  if (mfa) await prisma.adminMfaSession.create({ data: { userId, sessionId: row.id, expiresAt: row.expiresAt } });
  return { token, row };
}
test.beforeEach(async () => {
  fixture = await createReportFixture();
  storageDay = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`); originalStorage = await prisma.reportStorageObservation.findUnique({ where: { day: storageDay } });
  await prisma.user.update({ where: { id: fixture.staff.id }, data: { name: "Reports analyst", emailVerifiedAt: new Date(), staffMembership: { update: { role: "ANALYST" } } } });
  await prisma.adminMfaCredential.create({ data: { userId: fixture.staff.id, enabledAt: new Date(), secretCiphertext: "report-browser-fixture" } });
});
test.afterEach(async () => {
  if (!fixture) return;
  await clearRateLimit("admin.reports", [fixture.staff.id]);
  await clearRateLimit("admin.report-export", [fixture.staff.id]); await clearRateLimit("admin.report-download", [fixture.staff.id]);
  await clearRateLimit("admin.job-retry", [fixture.staff.id]);
  const exports = await prisma.reportExport.findMany({ where: { actorUserId: fixture.staff.id }, select: { jobId: true } });
  await prisma.reportExport.deleteMany({ where: { actorUserId: fixture.staff.id } });
  await prisma.reportDailySnapshot.deleteMany({ where: { id: { in: snapshotIds } } });
  await prisma.reportStorageObservation.deleteMany({ where: { day: storageDay } }); if (originalStorage) await prisma.reportStorageObservation.create({ data: originalStorage });
  await prisma.job.deleteMany({ where: { id: { in: [...jobIds, ...exports.map(row => row.jobId)].filter((id): id is string => Boolean(id)) } } });
  snapshotIds.length = 0; jobIds.length = 0;
  await prisma.adminMfaSession.deleteMany({ where: { userId: fixture.staff.id } });
  await prisma.adminMfaCredential.deleteMany({ where: { userId: fixture.staff.id } });
  await prisma.userPreference.deleteMany({ where: { userId: fixture.staff.id } });
  await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: fixture.staff.id } });
  await fixture.cleanup();
});

test("administrator requests a background export and downloads only within the authorized sign-in", async ({ page, context, browser }, info) => {
  const identity = await session(fixture.staff.id);
  await context.addCookies([{ name: "jitm_session", value: identity.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  const repeated = await prisma.waitlistDelivery.findFirstOrThrow({ where: { invite: { recipientEmail: fixture.members[0].user.email, source: "REFERRAL" } } });
  await prisma.invitationDeliveryHistory.create({ data: { deliveryId: repeated.id, generation: 1, emailMessageId: repeated.emailMessageId!, status: "SENT", attempts: repeated.attempts, generationStartedAt: repeated.createdAt } });
  await prisma.waitlistDelivery.update({ where: { id: repeated.id }, data: { emailMessageId: null, generation: 2, status: "QUEUED" } });
  await page.goto("/admin/reports?from=2020-01-01&through=2020-01-31");
  const referral = page.getByRole("table", { name: "Invitation cohorts by source" }).getByRole("row").filter({ hasText: "Member referral" });
  await expect(referral.getByRole("cell").nth(6)).toHaveText("1");
  await expect(referral.getByRole("cell").nth(7)).toHaveText("1");
  await expect(referral.getByRole("cell").nth(8)).toHaveText("1");
  await page.getByRole("button", { name: "Prepare CSV export" }).click();
  await expect(page).toHaveURL(/\/admin\/reports\/exports\?queued=1$/);
  await expect(page.getByText("The export is queued. Refresh status when it is ready.")).toBeVisible();
  const row = await prisma.reportExport.findFirstOrThrow({ where: { actorUserId: fixture.staff.id } });
  expect(row.contentCiphertext).toBeNull(); expect(row.status).toBe("QUEUED");
  await prisma.job.update({ where: { id: row.jobId! }, data: { failedAt: new Date(), attempts: 3, lastError: "Aggregate report preparation failed." } });
  await prisma.reportExport.update({ where: { id: row.id }, data: { status: "FAILED" } });
  await prisma.staffMembership.update({ where: { userId: fixture.staff.id }, data: { grants: ["operations.read", "jobs.retry"] } });
  await page.goto("/admin/operations?status=failed&task=admin-report-export");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page).toHaveURL(/retried=1$/); await expect(page.getByText("Job queued for another attempt.")).toBeVisible();
  expect((await prisma.reportExport.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("QUEUED");
  const leaseId = randomUUID(); await prisma.job.update({ where: { id: row.jobId! }, data: { lockedAt: new Date(), lockedBy: leaseId } });
  await runReportExport(row.id, { jobId: row.jobId!, leaseId });
  await page.goto("/admin/reports/exports");
  await expect(page.getByRole("link", { name: "Download CSV" })).toBeVisible();
  const received = page.waitForEvent("download"); await page.getByRole("link", { name: "Download CSV" }).click();
  const download = await received; expect(download.suggestedFilename()).toBe("jump-report-2020-01-01-2020-01-31.csv");
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain('"report","definition","version","2"');
  expect(csv).toContain('"invitation cohort","REFERRAL","providerAccepted","1"');
  expect(csv).toContain('"invitation cohort","REFERRAL","delivered","1"');
  expect(csv).toContain("Historical public library title"); expect(csv).not.toContain(fixture.secret);
  for (const member of fixture.members) expect(csv).not.toContain(member.user.email);
  const path = `/api/admin/reports/exports/${row.id}`;
  const http = await context.request.get(path); expect(http.status()).toBe(200); expect(http.headers()["cache-control"]).toContain("no-store"); expect(http.headers()["content-type"]).toContain("text/csv");
  const other = await browser.newContext({ baseURL: info.project.use.baseURL });
  try {
    const anotherSession = await session(fixture.staff.id);
    await other.addCookies([{ name: "jitm_session", value: anotherSession.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
    expect((await other.request.get(path)).status()).toBe(404);
  } finally { await other.close(); }
  for (const colorScheme of ["light", "dark"] as const) for (const width of [320, 1440]) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" }); await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
  await prisma.staffMembership.update({ where: { userId: fixture.staff.id }, data: { denies: ["reports.read"] } });
  const denied = await context.request.get(path, { maxRedirects: 0 }); expect(denied.headers().location).toBe("/admin/access-denied");
  await prisma.staffMembership.update({ where: { userId: fixture.staff.id }, data: { denies: [] } });
  await prisma.reportExport.update({ where: { id: row.id }, data: { expiresAt: new Date(Date.now() - 1) } }); expect((await context.request.get(path)).status()).toBe(404);
  await page.reload(); await expect(page.getByText("No unexpired exports for this sign-in.")).toBeVisible();
});

test("saved daily history shows recorded values, observation times and gated detail views", async ({ page, context }, info) => {
  test.setTimeout(120_000);
  const identity = await session(fixture.staff.id);
  await context.addCookies([{ name: "jitm_session", value: identity.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  const snapshot = await prisma.reportDailySnapshot.create({ data: { day: new Date("2020-01-03T00:00:00Z"), definitionKey: reportDefinitionKey() } }); snapshotIds.push(snapshot.id);
  const leaseId = randomUUID();
  const job = await prisma.job.create({ data: { task: REPORT_SNAPSHOT_TASK, payload: { snapshotId: snapshot.id }, lockedAt: new Date(), lockedBy: leaseId } }); jobIds.push(job.id);
  await prisma.reportDailySnapshot.update({ where: { id: snapshot.id }, data: { jobId: job.id } });
  await runReportSnapshot(snapshot.id, { jobId: job.id, leaseId });
  await page.goto("/admin/reports/history");
  await expect(page.getByRole("table", { name: "First storage measurement per UTC day" })).toContainText(storageDay.toISOString().slice(0, 10));
  await page.goto("/admin/reports/history?from=2020-01-01&through=2020-01-31");
  const table = page.getByRole("table", { name: "UTC activity dates and observed values" });
  await expect(table.getByRole("row")).toHaveCount(2); await expect(table).toContainText("READY");
  for (const colorScheme of ["light", "dark"] as const) for (const width of [320, 1440]) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" }); await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
  await page.getByRole("link", { name: "2020-01-03", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Saved daily report · 2020-01-03" })).toBeVisible();
  await expect(page.getByText("These are saved aggregates", { exact: false })).toBeVisible();
  await expect(page.locator("main")).not.toContainText(fixture.secret);
  await expect(page.getByRole("table", { name: "Library copies and follow-up outcomes in range" })).toContainText("Historical public library title");
  await prisma.staffMembership.update({ where: { userId: fixture.staff.id }, data: { denies: ["reports.read"] } });
  await page.reload(); await expect(page).toHaveURL(/\/admin\/access-denied$/);
});

test("analyst sees aggregate cohorts, switches trends and dates, and loses access after permission removal", async ({ page, context }, info) => {
  test.setTimeout(120_000);
  const identity = await session(fixture.staff.id);
  await context.addCookies([{ name: "jitm_session", value: identity.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" }]);
  const response = await page.goto("/admin/reports?from=2020-01-01&through=2020-01-31");
  await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
  expect(response?.headers()["cache-control"]).toContain("no-store");
  const html = await response!.text();
  expect(html).not.toContain(fixture.secret);
  for (const m of fixture.members) { expect(html).not.toContain(m.user.email); expect(html).not.toContain(m.user.id); }
  const activation = page.getByRole("heading", { name: "New account activation" }).locator("..");
  await expect(activation.locator("dl > div").filter({ hasText: "New accounts" })).toContainText("4");
  await expect(activation.locator("dl > div").filter({ hasText: "Activated" })).toContainText("1 (25%)");
  await expect(page.getByRole("table", { name: "Invitation cohorts by source" }).getByRole("row").filter({ hasText: "Member referral" })).toContainText("24 hours");
  await expect(page.getByRole("table", { name: "Library copies and follow-up outcomes in range" })).toContainText("Historical public library title");
  await page.getByRole("combobox", { name: "Trend metric" }).selectOption("emailFailures");
  await expect(page.locator("figcaption")).toContainText("Daily peak: 1 on 2020-01-05");
  await page.getByText("Show daily values (31 days)", { exact: true }).click();
  await expect(page.getByRole("table", { name: "Daily totals in UTC" }).getByRole("row")).toHaveCount(32);
  for (const colorScheme of ["light", "dark"] as const) for (const width of [320, 1440]) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" }); await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations).toEqual([]);
  }
  await page.getByLabel("From (UTC)").fill("2010-02-01"); await page.getByLabel("Through (UTC)").fill("2010-02-28");
  await page.getByRole("button", { name: "Update report" }).click();
  await expect(page).toHaveURL(/from=2010-02-01&through=2010-02-28/);
  await expect(page.getByText("No invitations were created in this range.")).toBeVisible();
  await page.getByRole("link", { name: "Last 7 days", exact: true }).click();
  await expect(page).toHaveURL(/days=7$/); await expect(page.getByText("Show daily values (7 days)", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Through (UTC)")).toHaveValue(new Date().toISOString().slice(0, 10));
  await prisma.staffMembership.update({ where: { userId: fixture.staff.id }, data: { denies: ["reports.read"] } });
  await page.goto("/admin/reports?from=2020-01-01&through=2020-01-31");
  await expect(page).toHaveURL(/\/admin\/access-denied$/);
  await expect(page.getByRole("navigation", { name: "Administration", exact: true }).getByRole("link", { name: "Reports", exact: true })).toHaveCount(0);
  expect(await prisma.platformAuditEvent.count({ where: { actorUserId: fixture.staff.id, action: "permission.denied", entityId: "reports.read" } })).toBeGreaterThan(0);
});

test("invalid dates, missing MFA, and customer credentials cannot expose a report", async ({ page, context }, info) => {
  const identity = await session(fixture.staff.id);
  const cookie = { name: "jitm_session", value: identity.token, url: info.project.use.baseURL!, httpOnly: true, sameSite: "Strict" as const };
  await context.addCookies([cookie]);
  for (const query of ["from=2020-02-30&through=2020-03-01", "days=7&days=30", "from=2010-01-01&through=2020-01-01"]) {
    await page.goto(`/admin/reports?${query}`);
    await expect(page.locator(".notice.error")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Invitation conversion" })).toHaveCount(0);
  }
  await prisma.adminMfaSession.deleteMany({ where: { sessionId: identity.row.id } });
  await page.goto("/admin/reports"); await expect(page).toHaveURL(/\/account\/admin-mfa\?verify=1/);
  const customer = await session(fixture.members[0].user.id, false);
  await context.addCookies([{ ...cookie, value: customer.token }]);
  const denied = await context.request.get("/admin/reports", { maxRedirects: 0 });
  expect(denied.headers().location).toBe("/jumps");
  expect(await denied.text()).not.toContain("Historical public library title");
  await context.clearCookies();
  const anonymous = await context.request.get("/admin/reports", { maxRedirects: 0 });
  expect(anonymous.headers().location).toMatch(/^\/login/);
});
