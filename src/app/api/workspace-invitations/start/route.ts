import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { WORKSPACE_INVITE_COOKIE, WORKSPACE_INVITE_TTL_MS, hashWorkspaceInvitationToken } from "@/lib/workspace-invitations";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawToken = url.searchParams.get("token")?.trim() ?? "";
  const invitation = rawToken
    ? await prisma.workspaceInvitation.findFirst({ where: { tokenHash: hashWorkspaceInvitationToken(rawToken), status: "PENDING", expiresAt: { gt: new Date() } }, select: { id: true, expiresAt: true } })
    : null;
  if (!invitation) return NextResponse.redirect(new URL("/join?error=That+workspace+invitation+is+invalid+or+expired.", env.appUrl));
  const store = await cookies();
  store.set(WORKSPACE_INVITE_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.max(60, Math.min(Math.floor((invitation.expiresAt.getTime() - Date.now()) / 1000), WORKSPACE_INVITE_TTL_MS / 1000))
  });
  return NextResponse.redirect(new URL("/join", env.appUrl));
}
