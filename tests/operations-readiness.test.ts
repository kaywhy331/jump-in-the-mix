import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("operations readiness boundaries", () => {
  it("keeps encrypted backup and restore commands explicit and safe", () => {
    const backup = read("scripts/backup-database.mjs");
    const archive = read("scripts/lib/backup-archive.mjs");
    const restore = read("scripts/restore-database.mjs");
    expect(archive).toContain('createCipheriv("aes-256-gcm"');
    expect(backup).toContain("Database changed while the backup was being captured");
    expect(restore).toContain("Restore target must be a different database from DATABASE_URL");
    expect(restore).toContain("assertDatabaseEmpty");
    expect(restore).toContain("compareSnapshots");
    expect(backup).toContain("PGDATABASE");
    expect(restore).toContain("PGDATABASE");
    expect(backup).not.toContain('"--dbname"');
    expect(restore).not.toContain('"--dbname"');
  });

  it("records worker heartbeats and exposes a bounded readiness endpoint", () => {
    const worker = read("src/worker/index.ts");
    const route = read("src/app/api/health/worker/route.ts");
    expect(worker).toContain("prisma.workerHeartbeat.upsert");
    expect(worker).toContain("heartbeatIntervalMs = 15_000");
    expect(worker).toContain("setInterval");
    expect(route).toContain("WORKER_HEARTBEAT_STALE_SECONDS");
    expect(route).toContain("status: ready ? 200 : 503");
    expect(route).not.toContain("workerId:");
  });

  it("runs encrypted restore qualification before browser workflows in CI", () => {
    const workflow = read(".github/workflows/ci.yml");
    const restoreIndex = workflow.indexOf("Encrypted backup and restore rehearsal");
    const browserIndex = workflow.indexOf("Browser-driven end-to-end tests");
    expect(restoreIndex).toBeGreaterThan(0);
    expect(browserIndex).toBeGreaterThan(restoreIndex);
    expect(workflow).toContain("BACKUP_ENCRYPTION_KEY");
    expect(workflow).toContain("npm run db:deploy");
  });

  it("wraps staging smoke failures with redacted operational alert delivery", () => {
    const wrapper = read("scripts/staging-smoke.mjs");
    const alerts = read("scripts/lib/ops-alert.mjs");
    expect(wrapper).toContain("sendOpsAlert");
    expect(wrapper).toContain("playwright.staging.config.ts");
    expect(alerts).toContain("[redacted]");
  });
});
