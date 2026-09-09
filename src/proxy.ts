import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { privateTestConfigurationIssues, privateTestEnabled, privateTestRequestAuthorized } from "@/lib/private-test";
import { workerRequestAuthorized } from "@/lib/worker-request";
import { databaseRecoveryStatus } from "@/lib/recovery-hold";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const IMPERSONATION_COOKIE = process.env.AUTH_IMPERSONATION_COOKIE_NAME ?? "jitm_impersonation";
const IMPERSONATION_END_PATH = "/api/admin/impersonation/end";
const isProduction = process.env.NODE_ENV === "production";
const RECOVERY_PUBLIC_PATHS = new Set([
  "/api/health/live", "/api/health/ready", "/sw.js", "/favicon.ico", "/favicon.png",
  "/brand-logo.png", "/relationship-preview.svg", "/relationship-preview.png", "/icon-source.svg",
  "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png", "/apple-touch-icon.png",
  "/product-proof/today.png", "/product-proof/contacts.png", "/product-proof/mixes.png",
  "/product-proof/mobile-jump.png", "/product-proof/quick-add.png"
]);

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
  // Invitation pages intentionally use a no-referrer meta policy. A native
  // recovery form there has an opaque Origin; require the browser's explicit
  // same-origin provenance, and allow only ending this browser's support view.
  if (request.method.toUpperCase() === "POST" && request.nextUrl.pathname === IMPERSONATION_END_PATH && origin === "null" && fetchSite === "same-origin") return true;
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

export async function proxy(request: NextRequest) {
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
  if (!SAFE_METHODS.has(request.method.toUpperCase()) || !RECOVERY_PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    const recovery = await databaseRecoveryStatus();
    if (recovery !== "clear") {
      const message = "Jump in the Mix is temporarily unavailable. Please try again later.";
      const headers = { "Cache-Control": "private, no-store", "Retry-After": "60", "X-Robots-Tag": "noindex, nofollow" };
      const response = request.nextUrl.pathname.startsWith("/api/")
        ? NextResponse.json({ error: message }, { status: 503, headers })
        : new NextResponse(message, { status: 503, headers });
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
  requestHeaders.set("x-jitm-request-id", randomUUID());
  requestHeaders.set("x-jitm-support-path", request.nextUrl.pathname);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy(nonce));
  const response = applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), nonce);

  if (request.nextUrl.pathname === "/register" || request.nextUrl.pathname.startsWith("/waitlist") || request.nextUrl.pathname.startsWith("/staff/accept")) {
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  if (privateTestEnabled()) {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  if (request.cookies.get(IMPERSONATION_COOKIE)?.value) {
    response.headers.set("Cache-Control", "private, no-store");
    // Native POST forms need a non-opaque Origin to pass the CSRF boundary.
    // Strip paths/search terms while retaining the origin for ending the view.
    response.headers.set("Referrer-Policy", "strict-origin");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"]
};
