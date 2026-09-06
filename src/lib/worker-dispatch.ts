import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";

const dispatchWindowMs = 10_000;
const maintenanceWakeMs = 60_000;
const jobLeaseMs = 10 * 60_000;

export function workerDispatchConfiguration() {
  if (process.env.WORKER_DISPATCH_MODE !== "netlify") return null;
  const secret = process.env.NETLIFY_WORKER_SECRET;
  if (!secret || secret.length < 32 || !process.env.APP_URL) return null;
  try {
    const origin = new URL(process.env.APP_URL);
    if (origin.protocol !== "https:" || origin.username || origin.password) return null;
    return { endpoint: new URL("/.netlify/functions/jump-worker-background", origin.origin), secret };
  } catch { return null; }
}

type DispatchOptions = { workspaceId?: string; queuedOnly?: boolean };
export type WorkerDispatchResult = "disabled" | "idle" | "throttled" | "accepted" | "failed";

async function hasWork({ workspaceId, queuedOnly }: DispatchOptions): Promise<boolean> {
  const now = new Date();
  const job = await prisma.job.findFirst({
    where: {
      ...(workspaceId ? { workspaceId } : {}),
      completedAt: null, failedAt: null, runAt: { lte: now },
      OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now.getTime() - jobLeaseMs) } }]
    },
    select: { id: true }
  });
  if (job) return true;
  if (queuedOnly) return false;
  const heartbeat = await prisma.workerHeartbeat.findFirst({
    where: { status: "RUNNING" }, orderBy: { lastSeenAt: "desc" }, select: { lastSeenAt: true }
  });
  return !heartbeat || now.getTime() - heartbeat.lastSeenAt.getTime() >= maintenanceWakeMs;
}

// This only requests processing. Jobs remain durable until the worker completes
// them with its existing lease; an HTTP 202 is not a completion receipt.
export async function dispatchWorkerPass(options: DispatchOptions = {}): Promise<WorkerDispatchResult> {
  const configuration = workerDispatchConfiguration();
  if (!configuration) return "disabled";
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (!await hasWork(options)) return "idle";
      const limit = await consumeRateLimit({
        scope: "background-dispatch", identifiers: ["netlify"], limit: 1,
        windowMs: dispatchWindowMs, blockMs: dispatchWindowMs
      });
      if (!limit.allowed) {
        if (attempt > 0 || limit.retryAfterSeconds > dispatchWindowMs / 1000) return "throttled";
        const trailing = await consumeRateLimit({
          scope: "background-dispatch-trailing", identifiers: ["netlify"], limit: 1,
          windowMs: dispatchWindowMs, blockMs: dispatchWindowMs
        });
        if (!trailing.allowed) return "throttled";
        // A trailing wakeup covers changes committed just after the first pass
        // finished. Only one response waits across the deployment. Recheck the
        // queue afterward; do not dispatch work another pass already completed.
        await new Promise(resolve => setTimeout(resolve, Math.max(1, limit.retryAfterSeconds) * 1000));
        continue;
      }
      const response = await fetch(configuration.endpoint, {
        method: "POST", redirect: "error",
        headers: { authorization: `Bearer ${configuration.secret}`, origin: configuration.endpoint.origin },
        signal: AbortSignal.timeout(5_000)
      });
      if (response.status !== 202) {
        console.error(`Background processor wakeup was rejected (${response.status}).`);
        return "failed";
      }
      return "accepted";
    }
    return "throttled";
  } catch {
    // No tokens, URLs, contact details, or provider payloads enter this log.
    console.error("Background processor wakeup failed; queued work remains pending.");
    return "failed";
  }
}
