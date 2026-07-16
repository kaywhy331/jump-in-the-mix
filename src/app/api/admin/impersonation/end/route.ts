import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { endAdminImpersonationGrant } from "@/lib/impersonation";

export async function POST(request: Request) {
  const session = await getCurrentSession();
  const rawToken = request.headers.get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${env.impersonationCookieName}=`))
    ?.slice(env.impersonationCookieName.length + 1);

  if (rawToken && session?.authUser.isPlatformAdmin) {
    await endAdminImpersonationGrant(decodeURIComponent(rawToken), session.authUser.id).catch(() => false);
  }

  const response = NextResponse.redirect(new URL(session?.authUser.isPlatformAdmin ? "/admin/users?impersonationEnded=1" : "/login", request.url), 303);
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