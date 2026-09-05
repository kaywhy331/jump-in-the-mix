import { workerRequestAuthorized } from "../../src/lib/worker-request";
import { runWorkerPass } from "../../src/worker/index";

export default async function handler(request: Request): Promise<void> {
  if (!workerRequestAuthorized(request, process.env.NETLIFY_WORKER_SECRET)) return;
  const processed = await runWorkerPass();
  console.info(`Background worker completed ${processed} queued jobs.`);
}

export const config = { background: true };
