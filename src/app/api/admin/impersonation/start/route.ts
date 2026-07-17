import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { createAdminImpersonationGrant, impersonationCookieOptions } from "@/lib/impersonation";
import { requestPublicUrl } from "@/lib/request-url";

function redirectWithError(request: Request, message: string) {
  const url = requestPublicUrl(request, "/admin/users");
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const { user } = await requirePlatformAdmin();
  const formData = await request.formData();
  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  const workspaceId = String(formData.get("workspaceId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!targetUserId || !workspaceId) return redirectWithError(request, "Choose a valid user workspace.");

  try {
    const { rawToken, grant } = await createAdminImpersonationGrant({
      actorUserId: user.id,
      targetUserId,
      workspaceId,
      reason
    });
    const response = NextResponse.redirect(requestPublicUrl(request, "/jumps?impersonating=1"), 303);
    response.cookies.set(env.impersonationCookieName, rawToken, impersonationCookieOptions(grant.expiresAt));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return redirectWithError(request, error instanceof Error ? error.message : "The view-only session could not be started.");
  }
}
