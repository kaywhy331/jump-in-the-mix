import type { ExportedHandler } from "@cloudflare/workers-types";

const handoffTimeoutMs = 10_000;

export async function runScheduledHandoff(env: JitmSchedulerEnv, scheduledTime: number): Promise<void> {
  let origin: URL;
  try { origin = new URL(env.APP_URL); }
  catch { throw new Error("The scheduler needs a valid HTTPS application origin."); }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("The scheduler needs a valid HTTPS application origin.");
  }
  if (!env.NETLIFY_WORKER_SECRET || env.NETLIFY_WORKER_SECRET.length < 32 || /[\r\n]/.test(env.NETLIFY_WORKER_SECRET)) {
    throw new Error("The scheduler needs a valid worker handoff secret.");
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Worker handoff deadline exceeded."));
    }, handoffTimeoutMs);
  });
  let status: number | null = null;
  try {
    const response = await Promise.race([deadline, fetch(new URL("/.netlify/functions/jump-worker-background", origin), {
      method: "POST",
      // workerd accepts follow/manual, but rejects Node's "error" mode.
      // Handle redirects as rejected responses without forwarding the secret.
      redirect: "manual",
      headers: { authorization: `Bearer ${env.NETLIFY_WORKER_SECRET}`, origin: origin.origin },
      signal: controller.signal
    })]);
    status = response.status;
    // The response body is not a processing receipt and may contain private
    // diagnostics. Release it without reading or recording its contents.
    await Promise.race([deadline, response.body?.cancel()]);
    if (status !== 202) throw new Error("Worker request was not accepted.");
    console.info({ event: "worker_handoff", scheduledTime, outcome: "accepted" });
  } catch {
    console.error({ event: "worker_handoff", scheduledTime, outcome: "failed", status });
    // A failed/unknown handoff leaves the durable queue intact. The next tick
    // uses the same worker leases; never log the secret or upstream error/body.
    throw new Error("Scheduled worker handoff failed.");
  } finally { clearTimeout(timer!); }
}

export default {
  async scheduled(controller, env) {
    await runScheduledHandoff(env, controller.scheduledTime);
  }
} satisfies ExportedHandler<JitmSchedulerEnv>;
