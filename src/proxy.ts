import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const IMPERSONATION_COOKIE = process.env.AUTH_IMPERSONATION_COOKIE_NAME ?? "jitm_impersonation";
const IMPERSONATION_END_PATH = "/api/admin/impersonation/end";
const isProduction = process.env.NODE_ENV === "production";
const BLOCKED_PREFIXES = [
  "/plans",
  "/billing",
  "/account/team",
  "/join",
  "/api/billing",
  "/api/integrations/google",
  "/api/webhooks/stripe",
  "/mixes/wizard",
  "/r/"
];

function isBlockedProductRoute(request: NextRequest): boolean {
  const pathname = request.nextUrl.pathname;
  if (BLOCKED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`) || (prefix.endsWith("/") && pathname.startsWith(prefix)))) return true;
  return /^\/mixes\/[^/]+\/share(?:\/|$)/.test(pathname);
}

function isRetiredAccountSection(request: NextRequest): boolean {
  if (request.nextUrl.pathname !== "/account") return false;
  return ["billing", "connections", "referrals", "team"].includes(request.nextUrl.searchParams.get("section") ?? "");
}

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

function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(self), geolocation=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  if (isProduction) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

export function proxy(request: NextRequest) {
  if (isRetiredAccountSection(request)) {
    return applySecurityHeaders(NextResponse.redirect(new URL("/account", request.url)));
  }
  if (isBlockedProductRoute(request)) {
    return applySecurityHeaders(new NextResponse("Not found", { status: 404 }));
  }
  if (!mutationAllowed(request)) {
    const response = request.nextUrl.pathname.startsWith("/api/")
      ? NextResponse.json({ error: "The request origin is not allowed." }, { status: 403 })
      : new NextResponse("The request origin is not allowed.", { status: 403 });
    return applySecurityHeaders(response);
  }

  if (!impersonationMutationAllowed(request)) {
    const response = request.nextUrl.pathname.startsWith("/api/")
      ? NextResponse.json({ error: "This support session is view-only. End it before making changes." }, { status: 403 })
      : new NextResponse("This support session is view-only. End it before making changes.", { status: 403 });
    return applySecurityHeaders(response);
  }

  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"]
};
