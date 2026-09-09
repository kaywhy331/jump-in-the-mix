import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { createAdminImpersonationGrant, impersonationCookieOptions } from "@/lib/impersonation";
import { consumeRateLimit } from "@/lib/rate-limit";
import { SupportAccessError } from "@/lib/support-case-access";
import { requestPublicUrl } from "@/lib/request-url";

function redirectWithError(request: Request, ticketId: string, message: string) {
  const url = requestPublicUrl(request, ticketId ? `/admin/support/${encodeURIComponent(ticketId)}` : "/admin/support");
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const { user, session } = await requirePlatformAdmin(["support.manage", "support.view_customer"]);
  const formData = await request.formData();
  const ticketId = String(formData.get("ticketId") ?? "").trim();
  const expectedRevision = Number(formData.get("assignmentRevision") ?? NaN);
  const reason = String(formData.get("reason") ?? "").trim();
  if (!ticketId || ticketId.length > 100) return redirectWithError(request, "", "Choose a valid support ticket.");

  try {
    if (!(await consumeRateLimit({ scope: "admin.support-view", identifiers: [user.id], limit: 10, windowMs: 5 * 60_000 })).allowed) throw new SupportAccessError("Too many support-view attempts. Please wait five minutes.");
    const { rawToken, grant } = await createAdminImpersonationGrant({
      actorUserId: user.id,
      actorSessionId: session.id,
      ticketId,
      expectedRevision,
      reason
    });
    const response = NextResponse.redirect(requestPublicUrl(request, "/jumps?impersonating=1"), 303);
    response.cookies.set(env.impersonationCookieName, rawToken, impersonationCookieOptions(grant.expiresAt));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return redirectWithError(request, ticketId, error instanceof SupportAccessError ? error.message : "The view-only session could not be started.");
  }
}
