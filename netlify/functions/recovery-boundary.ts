import { databaseRecoveryStatus } from "../../src/lib/recovery-hold";

// The recovery-boundary probe as its own small function. The edge proxy asks it before every
// non-public request; a probe served by the application function would pay that function's
// whole cold start inside the proxy's fail-closed budget right after a publish (issue #64).
// This bundle holds one catalog query, so its cold start is small and the application's own
// cold start is paid by the request that follows the check, not by the check.
//
// It answers the same shape as /api/health/recovery-boundary. On a private test site the
// proxy's access gate applies to this path as to every other; the path itself is exempt from the
// recovery check only for safe methods, so the probe cannot recurse into itself.
const headers = { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" };

export default async function handler(request: Request): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return new Response(null, { status: 405, headers: { ...headers, allow: "GET, HEAD" } });
  const status = await databaseRecoveryStatus();
  return Response.json({ status }, { headers });
}
