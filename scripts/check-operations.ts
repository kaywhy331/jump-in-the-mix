import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { pathToFileURL } from "node:url";
import { acquireOperationsMonitor, deliverOperationsNotices, failOperationsMonitor, saveOperationsObservations } from "../src/lib/operations-alerts";
import { collectOperationsSignals } from "../src/lib/operations-signals";
import { operationsPolicy } from "../src/lib/operations-policy";
import { operationsWebhook } from "../src/lib/operations-notifications";
import { readOperationsArtifactAges } from "./lib/operations-artifacts.mjs";
import { reportMonitorAvailability } from "./lib/operations-fallback";

export async function checkWebReadiness(originValue = process.env.APP_URL): Promise<boolean | null> {
  if (!originValue) return null;
  try {
    const origin = new URL(originValue);
    if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/" || origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))) return null;
    const response = await fetch(new URL("/api/health/ready", origin), { method: "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000) });
    // The readiness endpoint's status is its public contract; never retain a body.
    await response.body?.cancel();
    return response.status === 200;
  } catch { return false; }
}
export async function runOperationsCheck(db: PrismaClient, databaseUrl: string, statePath: string) {
  let lease: string | null = null;
  let completedAt: Date | undefined;
  try {
    lease = await acquireOperationsMonitor(new Date(), db);
    if (!lease) return { status: "busy" };
    const [webReady, ages] = await Promise.all([checkWebReadiness(), readOperationsArtifactAges(databaseUrl)]);
    const observedAt = new Date();
    const observations = await collectOperationsSignals({ webReady, ...ages, notificationsConfigured: Boolean(operationsWebhook()) }, observedAt, db);
    completedAt = new Date();
    await saveOperationsObservations(lease, observations, completedAt, db);
    await reportMonitorAvailability(true, statePath);
    const notifications = await deliverOperationsNotices(new Date(), 20, db);
    // Only bounded check names and counts reach command output.
    return { status: "observed", attention: observations.filter(item => item.state !== "OK").map(item => item.code), notificationsAccepted: notifications.accepted };
  } catch {
    if (lease) await failOperationsMonitor(lease, db, completedAt).catch(() => undefined);
    await reportMonitorAvailability(false, statePath);
    return { status: "unavailable" };
  }
}
async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim() || process.env.NETLIFY_DB_URL?.trim();
  if (!databaseUrl) throw new Error("Monitoring requires DATABASE_URL.");
  const policy = operationsPolicy();
  const statePath = process.env.OPS_MONITOR_STATE_FILE || ".operations/monitor-state.json";
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, query_timeout: 15000, max: 2 }), log: [] });
  let stopping = false;
  let wake: (() => void) | undefined;
  const stop = () => { stopping = true; wake?.(); };
  process.once("SIGTERM", stop); process.once("SIGINT", stop);
  try {
    do {
      const result = await runOperationsCheck(db, databaseUrl, statePath);
      console.log(JSON.stringify(result));
      process.exitCode = result.status === "unavailable" ? 1 : 0;
      if (!process.argv.includes("--watch") || stopping) break;
      await new Promise<void>(resolve => { const timer = setTimeout(resolve, policy.intervalSeconds * 1000); wake = () => { clearTimeout(timer); resolve(); }; });
    } while (!stopping);
  } finally { process.removeListener("SIGTERM", stop); process.removeListener("SIGINT", stop); await db.$disconnect(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error("Independent operations monitoring failed. Check its configuration and private state storage."); process.exitCode = 1; });
