// Scheduled invocations cannot stream responses. Use the buffered handler API;
// Netlify's bundler assigns streaming mode to default-export (v2) handlers.
export async function handler(): Promise<{ statusCode: number }> {
  const secret = process.env.NETLIFY_WORKER_SECRET;
  if (!secret || secret.length < 32 || !process.env.APP_URL) {
    throw new Error("Scheduled worker configuration is missing.");
  }
  const response = await fetch(new URL("/.netlify/functions/jump-worker-background", process.env.APP_URL), {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, origin: new URL(process.env.APP_URL).origin },
    signal: AbortSignal.timeout(10_000)
  });
  if (response.status !== 202) throw new Error(`Background worker invocation failed (${response.status}).`);
  return { statusCode: 200 };
}
