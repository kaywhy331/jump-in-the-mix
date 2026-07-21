import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { createGoogleAuthorizationUrl } from "@/lib/google-contacts";
import { PLAN_LIMITS } from "@/lib/plans";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";

function connectionsUrl(request: Request, key: string, value: string): URL {
  const url = new URL("/account", request.url);
  url.searchParams.set("section", "connections");
  url.searchParams.set(key, value);
  return url;
}

export async function GET(request: Request) {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return NextResponse.redirect(new URL("/login", request.url));
  if (session.impersonation) {
    return NextResponse.redirect(connectionsUrl(request, "google", "readonly"));
  }
  if (!PLAN_LIMITS[membership.workspace.planTier].googleContacts) {
    const plans = new URL("/plans", request.url);
    plans.searchParams.set("reason", "google-contacts");
    return NextResponse.redirect(plans);
  }
  const metadata = await getRequestMetadata();
  const rateLimit = await consumeRateLimit({
    scope: "api.google.oauth-start",
    identifiers: [membership.workspaceId, session.authUser.id, metadata.ipAddress],
    limit: 10,
    windowMs: 60 * 60 * 1000,
    blockMs: 30 * 60 * 1000
  });
  if (!rateLimit.allowed) {
    return NextResponse.redirect(connectionsUrl(request, "googleError", "Too many connection attempts. Try again later."));
  }
  try {
    const requestUrl = new URL(request.url);
    const authorizationUrl = await createGoogleAuthorizationUrl({
      workspaceId: membership.workspaceId,
      returnTo: requestUrl.searchParams.get("returnTo") ?? "/account?section=connections",
      loginHint: session.user.email
    });
    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Contacts could not be connected.";
    return NextResponse.redirect(connectionsUrl(request, "googleError", message));
  }
}
