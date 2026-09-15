import type { NextRequest } from "next/server";
import { privateTestConfigurationIssues, privateTestEnabled } from "@/lib/private-test";
import { RECOVERY_CHECK_TIMEOUT_MS } from "@/lib/recovery-hold-budget.mjs";

export type RecoveryBoundaryStatus = "clear" | "held" | "unavailable";

const DEFAULT_RECOVERY_BOUNDARY_PATH = "/api/health/recovery-boundary";

/**
 * Where the probe lives on the request's own origin. The default is the Next.js health route.
 * On Netlify the application function's cold start would otherwise sit inside this check's
 * budget right after a publish, so the site sets RECOVERY_BOUNDARY_PATH to the dedicated
 * `/.netlify/functions/recovery-boundary` function. Only a same-origin absolute path is
 * accepted; anything else falls back to the default rather than sending the check elsewhere.
 */
export function recoveryBoundaryPath(source: NodeJS.ProcessEnv = process.env): string {
  const configured = source.RECOVERY_BOUNDARY_PATH?.trim();
  return configured && /^\/[A-Za-z0-9._~\/-]+$/.test(configured) && !configured.startsWith("//") ? configured : DEFAULT_RECOVERY_BOUNDARY_PATH;
}

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
    const response = await fetch(new URL(recoveryBoundaryPath(), request.nextUrl.origin), {
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
