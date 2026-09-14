import type { NextRequest } from "next/server";
import { privateTestConfigurationIssues, privateTestEnabled } from "@/lib/private-test";

export type RecoveryBoundaryStatus = "clear" | "held" | "unavailable";

// The first request after an idle period pays for a cold application function and, on the
// test topology, a suspended database compute. The worker timers allow ten to twenty seconds
// for their handoff, so this budget stays inside theirs while the check still fails closed.
const RECOVERY_CHECK_TIMEOUT_MS = 8_000;

/**
 * The site's own private-test credentials for the internal check. The caller's header is never
 * reused: a worker timer authenticates with the worker secret as a Bearer token, which the
 * private-site gate does not accept, and forwarding it made every handoff fail closed.
 */
function privateTestAuthorization(): string | null {
  if (!privateTestEnabled() || privateTestConfigurationIssues().length > 0) return null;
  return `Basic ${Buffer.from(`${process.env.PRIVATE_TEST_USERNAME}:${process.env.PRIVATE_TEST_PASSWORD}`).toString("base64")}`;
}

export async function recoveryBoundaryStatus(request: NextRequest): Promise<RecoveryBoundaryStatus> {
  try {
    const headers: Record<string, string> = { accept: "application/json" };
    const authorization = privateTestAuthorization();
    if (authorization) headers.authorization = authorization;
    const response = await fetch(new URL("/api/health/recovery-boundary", request.nextUrl.origin), {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(RECOVERY_CHECK_TIMEOUT_MS)
    });
    if (!response.ok) return "unavailable";
    const body = await response.json() as { status?: unknown };
    return body.status === "clear" || body.status === "held" ? body.status : "unavailable";
  } catch {
    return "unavailable";
  }
}
