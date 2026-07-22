import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { acceptWorkspaceInvitationAction } from "@/lib/team-actions";
import { WORKSPACE_INVITE_COOKIE, hashWorkspaceInvitationToken, normalizeInvitationEmail } from "@/lib/workspace-invitations";

export const metadata: Metadata = { title: "Workspace invitation" };

type SearchParams = { error?: string };

export default async function JoinWorkspacePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [query, store, session] = await Promise.all([searchParams, cookies(), getCurrentSession()]);
  const rawToken = store.get(WORKSPACE_INVITE_COOKIE)?.value ?? "";
  const invitation = rawToken
    ? await prisma.workspaceInvitation.findFirst({ where: { tokenHash: hashWorkspaceInvitationToken(rawToken), status: "PENDING", expiresAt: { gt: new Date() } } })
    : null;
  const [workspace, inviter] = invitation
    ? await Promise.all([
        prisma.workspace.findUnique({ where: { id: invitation.workspaceId }, select: { name: true } }),
        prisma.user.findUnique({ where: { id: invitation.invitedByUserId }, select: { name: true } })
      ])
    : [null, null];
  const emailMatches = Boolean(session && invitation && normalizeInvitationEmail(session.user.email) === normalizeInvitationEmail(invitation.email));

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Logo />
        <h1>Workspace invitation</h1>
        {query.error && <Notice type="error">{query.error}</Notice>}
        {!invitation || !workspace ? (
          <Notice type="error">This invitation is missing, expired, revoked, or already used. Ask the workspace owner for a new invitation.</Notice>
        ) : (
          <>
            <p><strong>{inviter?.name ?? "A teammate"}</strong> invited <strong>{invitation.email}</strong> to join <strong>{workspace.name}</strong> as {invitation.role === "ADMIN" ? "an administrator" : "a member"}.</p>
            {!session ? (
              <div className="form-stack"><Notice type="info">Sign in or create an account using {invitation.email}. The invitation will remain ready after authentication.</Notice><Link className="button primary" href="/login">Sign in</Link><Link className="button" href="/register">Create account</Link></div>
            ) : !emailMatches ? (
              <div className="form-stack"><Notice type="error">You are signed in as {session.user.email}, but this invitation belongs to {invitation.email}.</Notice><Link className="button" href="/account">Review signed-in account</Link></div>
            ) : (
              <form action={acceptWorkspaceInvitationAction} className="form-stack"><Notice type="info">Accepting switches your active workspace to {workspace.name}. Your existing workspaces remain available from the workspace switcher.</Notice><button className="button primary" type="submit">Join {workspace.name}</button></form>
            )}
          </>
        )}
      </section>
    </main>
  );
}
