import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { privateTestConfigurationIssues, privateTestEnabled, privateTestRequestAuthorized } from "@/lib/private-test";
import { workerRequestAuthorized } from "@/lib/worker-request";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const IMPERSONATION_COOKIE = process.env.AUTH_IMPERSONATION_COOKIE_NAME ?? "jitm_impersonation";
const IMPERSONATION_END_PATH = "/api/admin/impersonation/end";
const isProduction = process.env.NODE_ENV === "production";

function configuredOrigins(): Set<string> {
  const values = [process.env.APP_URL, ...(process.env.AUTH_ALLOWED_ORIGINS ?? "").split(",")]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const origins = new Set<string>();
  for (const value of values) {
    try {
      origins.add(new URL(value.includes("://") ? value : `https://${value}`).origin);
    } catch {
      // Invalid optional origins are ignored instead of weakening the policy.
    }
  }
  return origins;
}

function requestOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return `${protocol}://${host}`;
}

function mutationAllowed(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
  if (request.nextUrl.pathname.startsWith("/api/webhooks/")) return true;

  const origin = request.headers.get("origin");
  if (
    request.method.toUpperCase() === "POST"
    && request.nextUrl.pathname === "/api/auth/oauth/apple/callback"
    && origin === "https://appleid.apple.com"
  ) return true;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin) {
    if (fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none") return true;
    return !isProduction && !fetchSite;
  }

  const allowed = configuredOrigins();
  if (!isProduction) allowed.add(requestOrigin(request));
  return allowed.has(origin);
}

function impersonationMutationAllowed(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
  if (!request.cookies.get(IMPERSONATION_COOKIE)?.value) return true;
  return request.nextUrl.pathname === IMPERSONATION_END_PATH;
}

function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProduction ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${isProduction ? "" : " http: https: ws: wss:"}`,
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isProduction ? ["upgrade-insecure-requests"] : [])
  ].join("; ");
}

function applySecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  response.headers.set("Content-Security-Policy", contentSecurityPolicy(nonce));
  if (isProduction) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

export function proxy(request: NextRequest) {
  const nonce = randomBytes(16).toString("base64");
  if (privateTestEnabled()) {
    const workerHandoff = request.nextUrl.pathname === "/.netlify/functions/jump-worker-background"
      && workerRequestAuthorized(request, process.env.NETLIFY_WORKER_SECRET);
    if (!workerHandoff && !privateTestRequestAuthorized(request.headers)) {
      const unavailable = privateTestConfigurationIssues().length > 0;
      const response = new NextResponse(unavailable ? "This private test deployment is unavailable." : "This test site requires its private access credentials.", {
        status: unavailable ? 503 : 401,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Robots-Tag": "noindex, nofollow",
          ...(!unavailable ? { "WWW-Authenticate": 'Basic realm="Jump in the Mix private testing", charset="UTF-8"' } : {})
        }
      });
      return applySecurityHeaders(response, nonce);
    }
  }
  if (!mutationAllowed(request)) {
    const response = request.nextUrl.pathname.startsWith("/api/")
      ? NextResponse.json({ error: "The request origin is not allowed." }, { status: 403 })
      : new NextResponse("The request origin is not allowed.", { status: 403 });
    return applySecurityHeaders(response, nonce);
  }

  if (!impersonationMutationAllowed(request)) {
    const response = request.nextUrl.pathname.startsWith("/api/")
      ? NextResponse.json({ error: "This support session is view-only. End it before making changes." }, { status: 403 })
      : new NextResponse("This support session is view-only. End it before making changes.", { status: 403 });
    return applySecurityHeaders(response, nonce);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy(nonce));
  const response = applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), nonce);
  if (privateTestEnabled()) {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"]
};
