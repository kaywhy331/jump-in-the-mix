import { mkdtemp, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportMonitorAvailability } from "../scripts/lib/operations-fallback";
import { privateJson, operationsSourceHash, writeOperationsReceipt, readOperationsArtifactAges } from "../scripts/lib/operations-artifacts.mjs";
import { operationsWebhook, postOperationsNotice } from "../src/lib/operations-notifications";
import { operationsPolicy, validateOperationsObservation } from "../src/lib/operations-policy";

describe("independent monitor artifacts and notification bounds", () => {
  let directory: string, statePath: string;
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "jitm-monitor-test-")); statePath = join(directory, "state.json"); vi.stubEnv("OPS_ALERT_WEBHOOK_URL", "http://127.0.0.1:9876/test-sink"); vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 }))); });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("delivers already-saved email alerts from before support metrics while requiring complete new observations", async () => {
    const evidence = { dayUsed: 80, dayLimit: 90, dayOtherUsed: 50, dayOtherLimit: 70, monthUsed: 100, monthLimit: 2700, monthOtherUsed: 50, monthOtherLimit: 2400 };
    expect(() => validateOperationsObservation({ code: "email", state: "WARNING", evidence })).toThrow("evidence");
    expect(await postOperationsNotice(new URL("http://127.0.0.1:9876/test-sink"), { id: "legacy-notice", code: "email", kind: "OPENED", state: "WARNING", observedAt: new Date().toISOString(), evidence })).toEqual({ accepted: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("keeps one durable outage notification across invocations and records recovery once", async () => {
    const start = new Date(); await reportMonitorAvailability(false, statePath, start);
    const saved = JSON.parse(await readFile(statePath, "utf8")); expect(saved).toMatchObject({ unavailable: true, attempts: 1, accepted: true });
    await reportMonitorAvailability(false, statePath, new Date(start.getTime() + 300_000)); expect(fetch).toHaveBeenCalledTimes(1);
    await reportMonitorAvailability(true, statePath, new Date(start.getTime() + 600_000));
    await reportMonitorAvailability(true, statePath, new Date(start.getTime() + 900_000)); expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(await readFile(statePath, "utf8"))).toMatchObject({ unavailable: false, kind: "RESOLVED", accepted: true });
  });
  it("reserves uncertain attempts before delivery, reuses the event ID, and bounds retries", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("PRIVATE_PROVIDER_DATA"); }));
    const start = Date.now();
    for (let i = 0; i < 7; i++) await reportMonitorAvailability(false, statePath, new Date(start + i * 3600_000));
    expect(fetch).toHaveBeenCalledTimes(5); const saved = JSON.parse(await readFile(statePath, "utf8")); expect(saved.attempts).toBe(5); expect(JSON.stringify(saved)).not.toContain("PRIVATE_PROVIDER");
    const payloads = vi.mocked(fetch).mock.calls.map(([, request]) => JSON.parse(request!.body as string)); expect(new Set(payloads.map(body => body.eventId)).size).toBe(1);
  });
  it("does not send a recovery for an outage that could not notify, and starts a daily reminder for a continuing outage", async () => {
    const start = Date.now(); vi.stubEnv("OPS_ALERT_WEBHOOK_URL", ""); await reportMonitorAvailability(false, statePath, new Date(start));
    vi.stubEnv("OPS_ALERT_WEBHOOK_URL", "http://127.0.0.1:9876/test-sink"); await reportMonitorAvailability(true, statePath, new Date(start + 1000)); expect(fetch).not.toHaveBeenCalled();
    await reportMonitorAvailability(false, statePath, new Date(start + 2000)); await reportMonitorAvailability(false, statePath, new Date(start + 25 * 3600_000));
    expect(fetch).toHaveBeenCalledTimes(2); expect(JSON.parse(await readFile(statePath, "utf8"))).toMatchObject({ kind: "REMINDER", attempts: 1 });
  });
  it("serializes concurrent monitor failure reports and rejects corrupt saved state", async () => {
    await Promise.all([reportMonitorAvailability(false, statePath), reportMonitorAvailability(false, statePath)]); expect(fetch).toHaveBeenCalledTimes(1);
    await writeFile(statePath, "not valid JSON"); await expect(reportMonitorAvailability(false, statePath)).rejects.toThrow("state file"); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not follow symlinked or oversized artifact files", async () => {
    const large = join(directory, "large.json"), link = join(directory, "link.json"); await writeFile(large, "x".repeat(200)); await symlink(large, link);
    await expect(privateJson(large, 100)).rejects.toThrow(); await expect(privateJson(link, 1000)).rejects.toThrow();
  });
  it("keeps connection credentials out of source identity and rejects a receipt for a different environment", async () => {
    const url = "postgresql://user:secret@127.0.0.1:55439/source", other = "postgresql://other:other-secret@127.0.0.1:55439/source";
    expect(operationsSourceHash(url)).toBe(operationsSourceHash(other));
    const receipt = { version: 1, kind: "restore", completedAt: new Date().toISOString(), sourceHash: operationsSourceHash(url), archiveSha256: "a".repeat(64), contentVerified: true, foreignKeysVerified: true };
    await writeOperationsReceipt(statePath, receipt);
    expect((await readOperationsArtifactAges(url, new Date(), { OPS_RESTORE_RECEIPT_FILE: statePath })).restoreAgeDays).toBeLessThan(1);
    expect((await readOperationsArtifactAges(`${url}-different`, new Date(), { OPS_RESTORE_RECEIPT_FILE: statePath })).restoreAgeDays).toBeNull();
    await writeOperationsReceipt(statePath, { ...receipt, foreignKeysVerified: false }); expect((await readOperationsArtifactAges(url, new Date(), { OPS_RESTORE_RECEIPT_FILE: statePath })).restoreAgeDays).toBeNull();
  });
  it("rejects destination credentials, redirects and private data in outgoing payloads", async () => {
    expect(operationsWebhook({ OPS_ALERT_WEBHOOK_URL: "https://user:secret@example.test/hook" })).toBeNull(); expect(operationsWebhook({ OPS_ALERT_WEBHOOK_URL: "file:///secret" })).toBeNull();
    expect(await postOperationsNotice(new URL("http://127.0.0.1:9876/test-sink"), { id: "test", code: "web", kind: "OPENED", state: "CRITICAL", observedAt: new Date().toISOString(), evidence: { ready: 0, privateToken: 1 } })).toEqual({ accepted: false }); expect(fetch).not.toHaveBeenCalled();
    await postOperationsNotice(new URL("http://127.0.0.1:9876/test-sink"), { id: "test", code: "web", kind: "OPENED", state: "CRITICAL", observedAt: new Date().toISOString(), evidence: { ready: 0 } }); expect(fetch).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: "error" }));
  });
  it("rejects malformed operational limits rather than treating them as healthy defaults", () => {
    expect(() => operationsPolicy({ OPS_DATABASE_LIMIT_BYTES: "-1" })).toThrow(); expect(() => operationsPolicy({ OPS_MONITOR_INTERVAL_SECONDS: "99999" })).toThrow(); expect(operationsPolicy({}).databaseLimitBytes).toBe(0);
  });
});
