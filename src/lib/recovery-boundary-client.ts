import type { NextRequest } from "next/server";

export type RecoveryBoundaryStatus = "clear" | "held" | "unavailable";

export async function recoveryBoundaryStatus(request: NextRequest): Promise<RecoveryBoundaryStatus> {
  try {
    const headers: Record<string, string> = { accept: "application/json" };
    const privateAuthorization = process.env.PRIVATE_TEST_MODE?.toLowerCase() === "true" ? request.headers.get("authorization") : null;
    if (privateAuthorization) headers.authorization = privateAuthorization;
    const response = await fetch(new URL("/api/health/recovery-boundary", request.nextUrl.origin), {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(2_500)
    });
    if (!response.ok) return "unavailable";
    const body = await response.json() as { status?: unknown };
    return body.status === "clear" || body.status === "held" ? body.status : "unavailable";
  } catch {
    return "unavailable";
  }
}
