import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { endAdminImpersonationGrant } from "@/lib/impersonation";
import { requestPublicUrl } from "@/lib/request-url";
import { userHasAdminPermission } from "@/lib/staff-access";

export async function POST(request: Request) {
  const session = await getCurrentSession();
  const rawToken = request.headers.get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${env.impersonationCookieName}=`))
    ?.slice(env.impersonationCookieName.length + 1);

  let decodedToken = "";
  try { decodedToken = rawToken ? decodeURIComponent(rawToken) : ""; } catch { /* Still clear an invalid browser cookie. */ }
  if (decodedToken && session?.authUser) {
    await endAdminImpersonationGrant(decodedToken, session.authUser.id).catch(() => false);
  }
  const canViewSupport = session && await userHasAdminPermission(session.authUser.id, "support.manage");
  const response = NextResponse.redirect(
    requestPublicUrl(request, canViewSupport ? "/admin/support?impersonationEnded=1" : "/login"),
    303
  );
  response.cookies.set(env.impersonationCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
    maxAge: 0
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
