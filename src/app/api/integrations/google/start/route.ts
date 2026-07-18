import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { createGoogleAuthorizationUrl } from "@/lib/google-contacts";
import { PLAN_LIMITS } from "@/lib/plans";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return NextResponse.redirect(new URL("/login", request.url));
  if (session.impersonation) {
    return NextResponse.redirect(new URL("/account?google=readonly", request.url));
  }
  if (!PLAN_LIMITS[membership.workspace.planTier].googleContacts) {
    return NextResponse.redirect(new URL("/account?google=upgrade", request.url));
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
    return NextResponse.redirect(new URL("/account?googleError=Too+many+connection+attempts.+Try+again+later.", request.url));
  }
  try {
    const requestUrl = new URL(request.url);
    const authorizationUrl = await createGoogleAuthorizationUrl({
      workspaceId: membership.workspaceId,
      returnTo: requestUrl.searchParams.get("returnTo") ?? "/account",
      loginHint: session.user.email
    });
    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Contacts could not be connected.";
    return NextResponse.redirect(new URL(`/account?googleError=${encodeURIComponent(message)}`, request.url));
  }
}
