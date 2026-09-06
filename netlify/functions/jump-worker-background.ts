import { workerRequestAuthorized } from "../../src/lib/worker-request";
import { runWorkerPass } from "../../src/worker/index";
import { dispatchWorkerPass } from "../../src/lib/worker-dispatch";

export default async function handler(request: Request): Promise<void> {
  if (!workerRequestAuthorized(request, process.env.NETLIFY_WORKER_SECRET)) return;
  const processed = await runWorkerPass();
  console.info(`Background worker completed ${processed} queued jobs.`);
  // Drain a backlog beyond one bounded pass without waiting for another cron.
  // Future retries and active leases are excluded, so an empty queue ends here.
  await dispatchWorkerPass({ queuedOnly: true });
}

export const config = { background: true };
