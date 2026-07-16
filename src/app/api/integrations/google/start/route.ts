import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { createGoogleAuthorizationUrl } from "@/lib/google-contacts";
import { PLAN_LIMITS } from "@/lib/plans";

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
