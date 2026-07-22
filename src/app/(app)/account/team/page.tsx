import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createWorkspaceInvitationAction,
  removeWorkspaceMemberAction,
  revokeWorkspaceInvitationAction,
  transferWorkspaceOwnershipAction,
  updateWorkspaceMemberRoleAction
} from "@/lib/team-actions";
import { workspaceInvitationStartUrl } from "@/lib/workspace-invitations";

export const metadata: Metadata = { title: "Workspace team" };

type SearchParams = {
  error?: string;
  invited?: string;
  devInvite?: string;
  inviteRevoked?: string;
  roleUpdated?: string;
  memberRemoved?: string;
  ownershipTransferred?: string;
};

export default async function WorkspaceTeamPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [query, { user, workspace, membership, impersonation }] = await Promise.all([searchParams, requireWorkspace()]);
  const [members, invitations] = await Promise.all([
    prisma.workspaceMember.findMany({ where: { workspaceId: workspace.id }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.workspaceInvitation.findMany({ where: { workspaceId: workspace.id, status: "PENDING", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } })
  ]);
  const canManage = !impersonation && (membership.role === "OWNER" || membership.role === "ADMIN");
  const isOwner = !impersonation && membership.role === "OWNER";

  return (
    <div className="page team-page">
      {query.error && <Notice type="error">{query.error}</Notice>}
      {query.invited && <Notice type="success">Workspace invitation sent.</Notice>}
      {query.inviteRevoked && <Notice type="success">Invitation revoked.</Notice>}
      {query.roleUpdated && <Notice type="success">Teammate role updated.</Notice>}
      {query.memberRemoved && <Notice type="success">Teammate removed. Their other workspaces and personal account were preserved.</Notice>}
      {query.ownershipTransferred && <Notice type="success">Workspace ownership transferred.</Notice>}
      {query.devInvite && process.env.NODE_ENV !== "production" && <Notice type="info">Local invitation preview: <a href={workspaceInvitationStartUrl(query.devInvite)}>open secure invitation</a>.</Notice>}
      <header className="page-header"><div><h1>Team</h1><p>Invite teammates, assign least-privilege roles, and transfer ownership without sharing credentials.</p></div><Link className="button" href="/account">My Account</Link></header>

      <section className="card">
        <div className="card-header"><div><h2>Workspace members</h2><p>Owners control billing, administrators manage the workspace, and members complete everyday relationship work.</p></div><span className="status-pill">{members.length}</span></div>
        <div className="team-member-list">
          {members.map((member) => (
            <article className="team-member-row" key={member.id}>
              <div><h3>{member.user.name}{member.userId === user.id ? " · You" : ""}</h3><p>{member.user.email}</p><span className={`status-pill ${member.role === "OWNER" ? "done" : ""}`}>{member.role.toLowerCase()}</span></div>
              {isOwner && member.role !== "OWNER" && <div className="page-actions"><form action={updateWorkspaceMemberRoleAction}><input type="hidden" name="memberId" value={member.id} /><select name="role" defaultValue={member.role} aria-label={`Role for ${member.user.name}`}><option value="MEMBER">Member</option><option value="ADMIN">Administrator</option></select><button className="button small" type="submit">Update role</button></form><ConfirmDialog trigger="Remove…" title={`Remove ${member.user.name}?`} description="Their account and other workspaces remain intact." danger><form action={removeWorkspaceMemberAction}><input type="hidden" name="memberId" value={member.id} /><button className="button small danger" type="submit">Confirm removal</button></form></ConfirmDialog></div>}
              {!isOwner && canManage && member.role === "MEMBER" && member.userId !== user.id && <ConfirmDialog trigger="Remove…" title={`Remove ${member.user.name}?`} description="Their account and other workspaces remain intact." danger><form action={removeWorkspaceMemberAction}><input type="hidden" name="memberId" value={member.id} /><button className="button small danger" type="submit">Confirm removal</button></form></ConfirmDialog>}
            </article>
          ))}
        </div>
      </section>

      {canManage && <section className="card"><div className="card-header"><div><h2>Invite teammate</h2><p>The one-time invitation expires in seven days and can be accepted only by the invited email.</p></div></div><form action={createWorkspaceInvitationAction} className="form-grid"><label className="field"><span>Email</span><input name="email" type="email" autoComplete="email" required /></label><label className="field"><span>Role</span><select name="role" defaultValue="MEMBER"><option value="MEMBER">Member</option>{isOwner && <option value="ADMIN">Administrator</option>}</select></label><div className="form-actions field full"><button className="button primary" type="submit">Send invitation</button></div></form></section>}

      <section className="card"><div className="card-header"><div><h2>Pending invitations</h2><p>Revoke links that are no longer needed.</p></div><span className="status-pill">{invitations.length}</span></div>{invitations.length ? <div className="team-member-list">{invitations.map((invitation) => <article className="team-member-row" key={invitation.id}><div><h3>{invitation.email}</h3><p>{invitation.role.toLowerCase()} · expires {invitation.expiresAt.toLocaleString()}</p></div>{canManage && (membership.role === "OWNER" || invitation.role === "MEMBER") && <form action={revokeWorkspaceInvitationAction}><input type="hidden" name="invitationId" value={invitation.id} /><button className="button small danger" type="submit">Revoke</button></form>}</article>)}</div> : <p className="muted-copy">No pending invitations.</p>}</section>

      {isOwner && members.length > 1 && <section className="card danger-zone"><div className="card-header"><div><h2>Transfer ownership</h2><p>The new owner receives billing and team authority. You remain an administrator.</p></div></div><form action={transferWorkspaceOwnershipAction} className="form-stack"><label className="field"><span>New owner</span><select name="memberId" required><option value="">Choose teammate</option>{members.filter((member) => member.userId !== user.id).map((member) => <option value={member.id} key={member.id}>{member.user.name} · {member.user.email}</option>)}</select></label><label className="field"><span>Type the workspace name to confirm</span><input name="confirmation" placeholder={workspace.name} required /></label><button className="button danger" type="submit">Transfer ownership</button></form></section>}
    </div>
  );
}
