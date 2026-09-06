import { cache } from "react";
import { after } from "next/server";
import { dispatchWorkerPass, workerDispatchConfiguration } from "@/lib/worker-dispatch";

// Capture the authorized workspace now. The callback runs after the response,
// when action transactions have committed, and never reads request APIs.
export const wakeWorkerAfterResponse = cache((workspaceId: string): void => {
  if (!workerDispatchConfiguration()) return;
  after(async () => { await dispatchWorkerPass({ workspaceId }); });
});
