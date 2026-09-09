import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma";
import { Prisma } from "../src/generated/prisma/client";
import { createReportFixture } from "./helpers/report-fixture";
vi.mock("@/lib/env", async original => { const mod = await original<typeof import("../src/lib/env")>(); return { ...mod, env: { ...mod.env, requireAdminMfa: true, dataEncryptionKey: "report-storage-local-test" } }; });
import { requestReportExport, runReportExport, downloadReportExport, type ReportActor } from "../src/lib/report-exports";
import { queueDailyReports, runReportSnapshot, markReportJobFailed } from "../src/lib/report-snapshots";
import { reportDefinitionKey, REPORT_EXPORT_TASK, REPORT_SNAPSHOT_TASK } from "../src/lib/report-storage-policy";
import { cleanupOperationalData } from "../src/lib/operational-retention";
import { reportCsv } from "../src/lib/report-csv";
import * as reports from "../src/lib/admin-report-data";
import { retryFailedJob } from "../src/lib/admin-job-retry";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("durable aggregate report exports and daily summaries", () => {
  let fixture: Awaited<ReturnType<typeof createReportFixture>>, actor: ReportActor;
  let schedule: Awaited<ReturnType<typeof prisma.reportSchedule.findUnique>>;
  let originalStorage: Awaited<ReturnType<typeof prisma.reportStorageObservation.findUnique>>;
  let storageDay: Date;
  let originalRetention: Awaited<ReturnType<typeof prisma.dataRetentionState.findUnique>>, priorRetentionAuditIds: string[];
  const jobIds: string[] = [], snapshotIds: string[] = [], definitionKeys: string[] = [];
  const input = () => ({ from: "2020-01-01", through: "2020-01-31", requestKey: randomUUID() });
  async function newSession() {
    const session = await prisma.session.create({ data: { userId: fixture.staff.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600_000) } });
    await prisma.adminMfaSession.create({ data: { userId: fixture.staff.id, sessionId: session.id, expiresAt: session.expiresAt } });
    return { actorUserId: fixture.staff.id, actorSessionId: session.id };
  }
  async function request() {
    const id = await requestReportExport(actor, input());
    const row = await prisma.reportExport.findUniqueOrThrow({ where: { id } }); jobIds.push(row.jobId!); return row;
  }
  async function lease(jobId: string) {
    const leaseId = randomUUID(); await prisma.job.update({ where: { id: jobId }, data: { lockedAt: new Date(), lockedBy: leaseId, failedAt: null, completedAt: null } }); return { jobId, leaseId };
  }
  beforeEach(async () => {
    originalRetention = await prisma.dataRetentionState.findUnique({ where: { id: "primary" } });
    priorRetentionAuditIds = (await prisma.platformAuditEvent.findMany({ where: { action: "privacy.retention.complete" }, select: { id: true } })).map(row => row.id);
    fixture = await createReportFixture(); schedule = await prisma.reportSchedule.findUnique({ where: { id: "daily" } });
    storageDay = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`); originalStorage = await prisma.reportStorageObservation.findUnique({ where: { day: storageDay } });
    vi.stubEnv("REPORT_EXCLUDED_EMAILS", `unused-${fixture.prefix}@example.test`); definitionKeys.push(reportDefinitionKey());
    await prisma.user.update({ where: { id: fixture.staff.id }, data: { emailVerifiedAt: new Date(), staffMembership: { update: { role: "ANALYST" } } } });
    await prisma.adminMfaCredential.create({ data: { userId: fixture.staff.id, enabledAt: new Date(), secretCiphertext: "synthetic-mfa" } }); actor = await newSession();
  }, 30_000);
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs();
    await prisma.dataRetentionState.deleteMany({ where: { id: "primary" } });
    if (originalRetention) await prisma.dataRetentionState.create({ data: { ...originalRetention, counts: originalRetention.counts ?? Prisma.DbNull } });
    await prisma.platformAuditEvent.deleteMany({ where: { action: "privacy.retention.complete", id: { notIn: priorRetentionAuditIds } } });
    const exports = await prisma.reportExport.findMany({ where: { actorUserId: fixture.staff.id }, select: { jobId: true } });
    const snapshots = await prisma.reportDailySnapshot.findMany({ where: { definitionKey: { in: definitionKeys } }, select: { id: true, jobId: true } });
    await prisma.reportDailySnapshot.deleteMany({ where: { OR: [{ definitionKey: { in: definitionKeys } }, { id: { in: snapshotIds } }] } });
    await prisma.reportSchedule.deleteMany({ where: { id: "daily" } }); if (schedule) await prisma.reportSchedule.create({ data: schedule });
    await prisma.reportStorageObservation.deleteMany({ where: { day: storageDay } }); if (originalStorage) await prisma.reportStorageObservation.create({ data: originalStorage });
    await prisma.reportExport.deleteMany({ where: { actorUserId: fixture.staff.id } });
    await prisma.job.deleteMany({ where: { id: { in: [...jobIds, ...exports.map(r => r.jobId), ...snapshots.map(r => r.jobId)].filter((id): id is string => Boolean(id)) } } });
    await prisma.adminMfaSession.deleteMany({ where: { userId: fixture.staff.id } }); await prisma.adminMfaCredential.deleteMany({ where: { userId: fixture.staff.id } });
    await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: fixture.staff.id } }); await fixture.cleanup();
    jobIds.length = 0; snapshotIds.length = 0; definitionKeys.length = 0;
  }, 30_000);
  it("atomically deduplicates requests, freezes encrypted CSV and audits authenticated downloads", async () => {
    const data = input(); const ids = await Promise.all([requestReportExport(actor, data), requestReportExport(actor, data)]); expect(ids[0]).toBe(ids[1]);
    const row = await prisma.reportExport.findUniqueOrThrow({ where: { id: ids[0] } }); jobIds.push(row.jobId!);
    expect(await prisma.platformAuditEvent.count({ where: { actorUserId: actor.actorUserId, action: "report.export.request" } })).toBe(1);
    await expect(requestReportExport(actor, { ...data, through: "2020-01-30" })).rejects.toThrow("request changed");
    const claimed = await lease(row.jobId!); await runReportExport(row.id, claimed);
    const prepared = await prisma.reportExport.findUniqueOrThrow({ where: { id: row.id } }); expect(prepared.status).toBe("READY");
    expect(prepared.contentCiphertext).not.toContain("Historical public library title");
    const download = await downloadReportExport(actor, row.id);
    expect(download.csv).toContain('"report","definition","version","2"');
    expect(download.csv).toContain('"report","definition","invitationReceipts"');
    expect(download.csv).toContain('"accounts","new account cohort; activeInRange includes all ages","created","4"');
    expect(download.csv).toContain("Historical public library title"); expect(download.csv).not.toContain(fixture.secret);
    for (const member of fixture.members) { expect(download.csv).not.toContain(member.user.email); expect(download.csv).not.toContain(member.user.id); }
    await prisma.workspaceProfile.update({ where: { workspaceId: fixture.members[0].workspace.id }, data: { onboardingDone: false } });
    await runReportExport(row.id, claimed);
    expect((await downloadReportExport(actor, row.id)).csv).toBe(download.csv);
    expect(await prisma.platformAuditEvent.count({ where: { actorUserId: actor.actorUserId, action: "report.export.ready" } })).toBe(1);
    expect(await prisma.platformAuditEvent.count({ where: { actorUserId: actor.actorUserId, action: "report.export.download" } })).toBe(2);
  });
  it("enforces pending capacity under concurrency and keeps daily allowances after session deletion", async () => {
    const results = await Promise.allSettled([request(), request(), request()]); expect(results.filter(r => r.status === "fulfilled")).toHaveLength(2);
    await prisma.reportExport.updateMany({ where: { actorUserId: actor.actorUserId }, data: { status: "FAILED" } });
    for (let i = 0; i < 3; i++) { const row = await request(); await prisma.reportExport.update({ where: { id: row.id }, data: { status: "FAILED" } }); }
    await prisma.session.delete({ where: { id: actor.actorSessionId } }); actor = await newSession();
    await expect(request()).rejects.toThrow("daily report export allowance");
  });
  it("rejects missing MFA and cancels queued exports when permission is removed", async () => {
    const row = await request();
    await prisma.adminMfaSession.deleteMany({ where: { sessionId: actor.actorSessionId } });
    await expect(request()).rejects.toThrow("current staff session");
    await runReportExport(row.id, await lease(row.jobId!));
    expect((await prisma.reportExport.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("CANCELLED");
    actor = await newSession(); const another = await request();
    await prisma.staffMembership.update({ where: { userId: actor.actorUserId }, data: { denies: ["reports.read"] } });
    await runReportExport(another.id, await lease(another.jobId!));
    expect((await prisma.reportExport.findUniqueOrThrow({ where: { id: another.id } })).contentCiphertext).toBeNull();
  });
  it("rechecks permission after calculation and does not publish under a stolen job lease", async () => {
    const realRead = reports.readAdminReport;
    let row = await request();
    const revoke = vi.spyOn(reports, "readAdminReport").mockImplementation(async (...args) => { const report = await realRead(...args); await prisma.staffMembership.update({ where: { userId: actor.actorUserId }, data: { denies: ["reports.read"] } }); return report; });
    await runReportExport(row.id, await lease(row.jobId!)); expect((await prisma.reportExport.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("CANCELLED"); revoke.mockRestore();
    await prisma.staffMembership.update({ where: { userId: actor.actorUserId }, data: { denies: [] } }); row = await request();
    const steal = vi.spyOn(reports, "readAdminReport").mockImplementation(async (...args) => { const report = await realRead(...args); await prisma.job.update({ where: { id: row.jobId! }, data: { lockedBy: "new-worker" } }); return report; });
    await expect(runReportExport(row.id, await lease(row.jobId!))).rejects.toThrow("could not be prepared");
    expect((await prisma.reportExport.findUniqueOrThrow({ where: { id: row.id } })).contentCiphertext).toBeNull(); steal.mockRestore();
    await runReportExport(row.id, await lease(row.jobId!)); expect((await prisma.reportExport.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("READY");
  });
  it("binds downloads to the original session, enforces expiry and removes expired content", async () => {
    const row = await request(); await runReportExport(row.id, await lease(row.jobId!));
    await expect(downloadReportExport(await newSession(), row.id)).rejects.toThrow("another sign-in");
    await prisma.reportExport.update({ where: { id: row.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    await expect(downloadReportExport(actor, row.id)).rejects.toThrow("expired");
    await cleanupOperationalData(); expect(await prisma.reportExport.findUnique({ where: { id: row.id } })).toBeNull();
  });
  it("rejects encrypted content substituted from another export", async () => {
    const first = await request(); await runReportExport(first.id, await lease(first.jobId!));
    const second = await request(); await runReportExport(second.id, await lease(second.jobId!));
    const other = await prisma.reportExport.findUniqueOrThrow({ where: { id: second.id } });
    await prisma.reportExport.update({ where: { id: first.id }, data: { contentCiphertext: other.contentCiphertext, byteCount: other.byteCount } });
    await expect(downloadReportExport(actor, first.id)).rejects.toThrow("could not be opened");
  });
  it("exports every library dimension beyond the twenty-row screen preview", async () => {
    const sharedIds: string[] = [];
    try {
      for (let i = 0; i < 21; i++) {
        const shared = await prisma.sharedMix.create({ data: { title: `Public report catalog ${i}`, description: "Public fixture", durationDays: 1, category: "Relationships", steps: [], status: "APPROVED" } }); sharedIds.push(shared.id);
        await prisma.sharedMixImport.create({ data: { workspaceId: fixture.members[0].workspace.id, mixId: fixture.members[0].mix.id, sharedMixId: shared.id, importKey: randomUUID(), createdAt: new Date("2020-01-03T00:00:00Z") } });
      }
      expect((await reports.readAdminReport(fixture.range)).library).toHaveLength(20);
      expect((await reports.readAdminReport(fixture.range, true)).library).toHaveLength(22);
      const row = await request(); await runReportExport(row.id, await lease(row.jobId!));
      const csv = (await downloadReportExport(actor, row.id)).csv;
      for (let i = 0; i < 21; i++) expect(csv).toContain(`Public report catalog ${i}`);
    } finally { await prisma.sharedMix.deleteMany({ where: { id: { in: sharedIds } } }); }
  });
  it("preserves failure state against an operator retry and regenerates only under its current lease", async () => {
    const row = await request(); await lease(row.jobId!);
    await prisma.job.update({ where: { id: row.jobId! }, data: { failedAt: new Date() } }); await markReportJobFailed(row.jobId!);
    expect((await prisma.reportExport.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("FAILED");
    const claimed = await lease(row.jobId!); await prisma.reportExport.update({ where: { id: row.id }, data: { status: "RUNNING" } }); await markReportJobFailed(row.jobId!);
    expect((await prisma.reportExport.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("RUNNING"); await runReportExport(row.id, claimed);
    expect((await prisma.reportExport.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("READY");
  });
  it("atomically retries only the reviewed terminal failure and resets the matching report queue", async () => {
    await prisma.staffMembership.update({ where: { userId: actor.actorUserId }, data: { grants: ["jobs.retry"] } });
    const row = await request(), failedAt = new Date();
    await prisma.job.update({ where: { id: row.jobId! }, data: { failedAt, attempts: 3 } }); await markReportJobFailed(row.jobId!);
    const args = { ...actor, jobId: row.jobId!, expectedFailedAt: failedAt.toISOString() };
    const replies = await Promise.allSettled([retryFailedJob(args), retryFailedJob(args)]);
    expect(replies.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await prisma.reportExport.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("QUEUED");
    expect(await prisma.platformAuditEvent.count({ where: { actorUserId: actor.actorUserId, action: "job.retry" } })).toBe(1);
    await prisma.job.update({ where: { id: row.jobId! }, data: { failedAt: new Date(failedAt.getTime() + 1000) } });
    await expect(retryFailedJob(args)).rejects.toThrow("job changed");
  });
  it.each(["CANCELED", "COMPLETED", "PARTIAL", "FAILED"] as const)("only retries a resumable import, checking its %s state", async status => {
    await prisma.staffMembership.update({ where: { userId: actor.actorUserId }, data: { grants: ["jobs.retry"] } });
    const member = fixture.members[0], failedAt = new Date();
    const batch = await prisma.contactImportBatch.create({ data: { workspaceId: member.workspace.id, actorUserId: member.user.id, importId: randomUUID(), status, totalRows: 1, completedAt: failedAt, payload: { items: [], initialResults: [] }, ...(status === "CANCELED" ? { canceledAt: failedAt } : {}) } });
    try {
      const job = await prisma.job.create({ data: { workspaceId: member.workspace.id, task: "contact-import", payload: { batchId: batch.id }, failedAt, attempts: 8 } });
      const args = { ...actor, jobId: job.id, expectedFailedAt: failedAt.toISOString() };
      if (status === "FAILED") {
        await retryFailedJob(args);
        expect(await prisma.job.findUnique({ where: { id: job.id } })).toMatchObject({ attempts: 0, failedAt: null });
      } else {
        await expect(retryFailedJob(args)).rejects.toThrow("closed or unavailable");
        expect(await prisma.job.findUnique({ where: { id: job.id } })).toMatchObject({ attempts: 8, failedAt });
      }
    } finally { await prisma.contactImportBatch.delete({ where: { id: batch.id } }); }
  });
  it("cannot steal a running job because a previous attempt left an error", async () => {
    await prisma.staffMembership.update({ where: { userId: actor.actorUserId }, data: { grants: ["jobs.retry"] } });
    const row = await request(); const claimed = await lease(row.jobId!);
    await prisma.job.update({ where: { id: row.jobId! }, data: { lastError: "Earlier attempt failed", attempts: 2 } });
    await expect(retryFailedJob({ ...actor, jobId: row.jobId!, expectedFailedAt: new Date().toISOString() })).rejects.toThrow("terminal failure");
    expect((await prisma.job.findUniqueOrThrow({ where: { id: row.jobId! } })).lockedBy).toBe(claimed.leaseId);
  });
  it("rechecks retry permission, MFA and the current session before changing a failed job", async () => {
    const row = await request(), failedAt = new Date(); await prisma.job.update({ where: { id: row.jobId! }, data: { failedAt } });
    const args = { ...actor, jobId: row.jobId!, expectedFailedAt: failedAt.toISOString() };
    await expect(retryFailedJob(args)).rejects.toThrow("staff session");
    await prisma.staffMembership.update({ where: { userId: actor.actorUserId }, data: { grants: ["jobs.retry"] } });
    await prisma.adminMfaSession.deleteMany({ where: { sessionId: actor.actorSessionId } }); await expect(retryFailedJob(args)).rejects.toThrow("Verify MFA");
    await prisma.session.delete({ where: { id: actor.actorSessionId } }); await expect(retryFailedJob(args)).rejects.toThrow("staff session");
    expect((await prisma.job.findUniqueOrThrow({ where: { id: row.jobId! } })).failedAt).toEqual(failedAt);
  });
  it("quotes CSV cells, neutralizes formulas, rejects oversized exports and never serializes extra fields", async () => {
    const data = await reports.readAdminReport(fixture.range, true);
    data.sources[0].source = " \t=HYPERLINK(\"danger\")";
    (data as unknown as Record<string, unknown>).privateData = fixture.secret;
    const csv = reportCsv(data, fixture.range); expect(csv).toContain('"\' \t=HYPERLINK(""danger"")"'); expect(csv).not.toContain(fixture.secret);
    data.library[0].title = "x".repeat(600_000); expect(() => reportCsv(data, fixture.range)).toThrow("size limit");
  });
  it("queues daily work once across concurrent schedulers and separates exclusion definitions", async () => {
    const counts = await Promise.all([queueDailyReports(), queueDailyReports()]); expect(counts.reduce((a, b) => a + b, 0)).toBe(7);
    expect(await prisma.reportDailySnapshot.count({ where: { definitionKey: reportDefinitionKey() } })).toBe(7);
    vi.stubEnv("REPORT_EXCLUDED_EMAILS", `changed-${fixture.prefix}@example.test`); definitionKeys.push(reportDefinitionKey());
    expect(await queueDailyReports()).toBe(7);
    expect(await prisma.reportDailySnapshot.count({ where: { definitionKey: { in: definitionKeys } } })).toBe(14);
  });
  it("refreshes existing cohorts after complete D7/D30 windows while leaving other older days untouched", async () => {
    const now = new Date(), today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
    const payload = JSON.parse(JSON.stringify(await reports.readAdminReport(fixture.range, true)));
    const rows = [];
    for (const age of [8, 9, 31, 32]) {
      const day = new Date(today.getTime() - age * 86_400_000);
      rows.push(await prisma.reportDailySnapshot.create({ data: { day, definitionKey: reportDefinitionKey(), status: "READY", payload, observedAt: new Date(today.getTime() - 86_400_000) } }));
    }
    expect(await queueDailyReports(now)).toBe(9); // Seven recent days plus the two mature cohorts.
    for (const [index, row] of rows.entries()) {
      const latest = await prisma.reportDailySnapshot.findUniqueOrThrow({ where: { id: row.id } });
      expect(latest.status).toBe(index === 1 || index === 3 ? "QUEUED" : "READY");
      expect(latest.payload).toEqual(payload);
    }
    expect(await queueDailyReports(now)).toBe(0);
  });
  it("saves real daily and source/version aggregates, keeps the observation time, and honors retention", async () => {
    const row = await prisma.reportDailySnapshot.create({ data: { day: new Date("2020-01-03T00:00:00Z"), definitionKey: reportDefinitionKey() } }); snapshotIds.push(row.id);
    const job = await prisma.job.create({ data: { task: REPORT_SNAPSHOT_TASK, payload: { snapshotId: row.id } } }); jobIds.push(job.id);
    await prisma.reportDailySnapshot.update({ where: { id: row.id }, data: { jobId: job.id } });
    const claimed = await lease(job.id); await runReportSnapshot(row.id, claimed);
    const snapshot = await prisma.reportDailySnapshot.findUniqueOrThrow({ where: { id: row.id } }); expect(snapshot.status).toBe("READY"); expect(snapshot.observedAt!.getTime()).toBeGreaterThan(Date.now() - 30_000);
    const data = snapshot.payload as unknown as reports.ReportData;
    expect(data.daily).toHaveLength(1); expect(data.daily[0]).toMatchObject({ day: "2020-01-03", active: 2, completed: 2, skipped: 1 });
    expect(data.library[0]).toMatchObject({ title: "Historical public library title", version: 2, completed: 1 });
    expect(JSON.stringify(data)).not.toContain(fixture.secret);
    await runReportSnapshot(row.id, claimed); expect((await prisma.reportDailySnapshot.findUniqueOrThrow({ where: { id: row.id } })).observedAt).toEqual(snapshot.observedAt);
    const storage = await prisma.reportStorageObservation.findUniqueOrThrow({ where: { day: storageDay } });
    // Recalculation can restate a cohort but must preserve today's first physical observation.
    await prisma.reportDailySnapshot.update({ where: { id: row.id }, data: { status: "QUEUED" } }); await runReportSnapshot(row.id, claimed);
    expect(await prisma.reportStorageObservation.findUnique({ where: { day: storageDay } })).toEqual(storage);
    await cleanupOperationalData(); expect(await prisma.reportDailySnapshot.findUnique({ where: { id: row.id } })).toBeNull();
    expect(await prisma.reportStorageObservation.findUnique({ where: { day: storageDay } })).toEqual(storage);
  });
});
