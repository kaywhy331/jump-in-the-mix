import type { NextRequest } from "next/server";
import { privateTestConfigurationIssues, privateTestEnabled } from "@/lib/private-test";
import { RECOVERY_CHECK_TIMEOUT_MS } from "@/lib/recovery-hold-budget.mjs";

export type RecoveryBoundaryStatus = "clear" | "held" | "unavailable";

const DEFAULT_RECOVERY_BOUNDARY_PATH = "/api/health/recovery-boundary";

/** The dedicated probe path is configured by the hosting environment, never the caller. */
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

export async function recoveryBoundaryStatus(_request: NextRequest): Promise<RecoveryBoundaryStatus> {
  try {
    // Standalone Node has a bounded database reader. Self-fetching a request-derived HTTPS
    // origin can address the plaintext listener behind TLS termination (Render).
    if (!process.env.RECOVERY_BOUNDARY_PATH?.trim()) {
      const { databaseRecoveryStatus } = await import("@/lib/recovery-hold");
      return await databaseRecoveryStatus();
    }
    const path = process.env.RECOVERY_BOUNDARY_PATH.trim();
    if (recoveryBoundaryPath() !== path || path.split("/").some(segment => segment === "." || segment === "..")) return "unavailable";
    // Netlify's dedicated function stays outside the application function's cold start.
    // APP_URL is operator configuration; request origins and forwarded headers are untrusted.
    const endpoint = new URL(process.env.APP_URL ?? "");
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/") return "unavailable";
    endpoint.pathname = path;
    const headers: Record<string, string> = { accept: "application/json" };
    const authorization = privateTestAuthorization();
    if (authorization) headers.authorization = authorization;
    const response = await fetch(endpoint, {
      cache: "no-store",
      redirect: "error",
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
