"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { WorkspaceRole } from "@/generated/prisma/client";
import { requireSession, requireWorkspace } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendTransactionalEmail } from "@/lib/transactional-email";
import {
  WORKSPACE_INVITE_COOKIE,
  WORKSPACE_INVITE_TTL_MS,
  createWorkspaceInvitationToken,
  hashWorkspaceInvitationToken,
  normalizeInvitationEmail,
  validInvitationEmail,
  workspaceInvitationStartUrl
} from "@/lib/workspace-invitations";

function value(formData: FormData, key: string, maximum = 500): string {
  return String(formData.get(key) ?? "").trim().slice(0, maximum);
}

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

function canManage(role: WorkspaceRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

async function invitationEmail(input: { email: string; inviterName: string; workspaceName: string; role: WorkspaceRole; rawToken: string }) {
  const url = workspaceInvitationStartUrl(input.rawToken);
  const roleLabel = input.role === "ADMIN" ? "an administrator" : "a member";
  await sendTransactionalEmail({
    to: input.email,
    subject: `Join ${input.workspaceName} in Jump in the Mix`,
    text: `${input.inviterName} invited you to join ${input.workspaceName} as ${roleLabel}. Open this secure link within seven days: ${url}`,
    html: `<p>${escapeHtml(input.inviterName)} invited you to join <strong>${escapeHtml(input.workspaceName)}</strong> as ${escapeHtml(roleLabel)}.</p><p><a href="${escapeHtml(url)}">Review workspace invitation</a></p><p>This one-time link expires in seven days and can be accepted only by ${escapeHtml(input.email)}.</p>`
  });
}

export async function createWorkspaceInvitationAction(formData: FormData): Promise<void> {
  const { user, workspace, membership, impersonation } = await requireWorkspace();
  const path = "/account/team";
  if (impersonation || !canManage(membership.role)) fail(path, "Only workspace owners and administrators can invite teammates.");
  const email = normalizeInvitationEmail(value(formData, "email", 254));
  const role = value(formData, "role") === "ADMIN" ? "ADMIN" as const : "MEMBER" as const;
  if (!validInvitationEmail(email)) fail(path, "Enter a valid teammate email address.");
  if (role === "ADMIN" && membership.role !== "OWNER") fail(path, "Only the workspace owner can invite an administrator.");
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser && await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: workspace.id, userId: existingUser.id } } })) {
    fail(path, "That person already belongs to this workspace.");
  }
  const token = createWorkspaceInvitationToken();
  const expiresAt = new Date(Date.now() + WORKSPACE_INVITE_TTL_MS);
  const invitation = await prisma.$transaction(async (tx) => {
    await tx.workspaceInvitation.updateMany({
      where: { workspaceId: workspace.id, email, status: "PENDING" },
      data: { status: "REVOKED", revokedAt: new Date() }
    });
    const created = await tx.workspaceInvitation.create({
      data: { workspaceId: workspace.id, invitedByUserId: user.id, email, role, tokenHash: token.hash, expiresAt }
    });
    await tx.auditLog.create({
      data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "workspace.invitation.create", entityType: "WorkspaceInvitation", entityId: created.id, source: "account.team", metadata: { email, role, expiresAt: expiresAt.toISOString() } }
    });
    return created;
  });
  try {
    await invitationEmail({ email, inviterName: user.name, workspaceName: workspace.name, role, rawToken: token.raw });
  } catch (error) {
    await prisma.workspaceInvitation.updateMany({ where: { id: invitation.id, status: "PENDING" }, data: { status: "REVOKED", revokedAt: new Date() } });
    fail(path, "The invitation email could not be delivered. Check email delivery configuration and try again.");
  }
  const params = new URLSearchParams({ invited: "1" });
  if (process.env.NODE_ENV !== "production") params.set("devInvite", token.raw);
  redirect(`${path}?${params.toString()}`);
}

export async function revokeWorkspaceInvitationAction(formData: FormData): Promise<void> {
  const { user, workspace, membership, impersonation } = await requireWorkspace();
  const path = "/account/team";
  if (impersonation || !canManage(membership.role)) fail(path, "Only workspace owners and administrators can revoke invitations.");
  const invitationId = value(formData, "invitationId", 120);
  const invitation = await prisma.workspaceInvitation.findFirst({ where: { id: invitationId, workspaceId: workspace.id, status: "PENDING" } });
  if (!invitation) fail(path, "That invitation is no longer pending.");
  if (invitation.role === "ADMIN" && membership.role !== "OWNER") fail(path, "Only the owner can revoke an administrator invitation.");
  await prisma.$transaction([
    prisma.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: "REVOKED", revokedAt: new Date() } }),
    prisma.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "workspace.invitation.revoke", entityType: "WorkspaceInvitation", entityId: invitation.id, source: "account.team" } })
  ]);
  redirect(`${path}?inviteRevoked=1`);
}

export async function updateWorkspaceMemberRoleAction(formData: FormData): Promise<void> {
  const { user, workspace, membership, impersonation } = await requireWorkspace();
  const path = "/account/team";
  if (impersonation || membership.role !== "OWNER") fail(path, "Only the workspace owner can change roles.");
  const memberId = value(formData, "memberId", 120);
  const role = value(formData, "role") === "ADMIN" ? "ADMIN" as const : "MEMBER" as const;
  const target = await prisma.workspaceMember.findFirst({ where: { id: memberId, workspaceId: workspace.id }, include: { user: { select: { name: true, email: true } } } });
  if (!target || target.role === "OWNER") fail(path, "The selected member role cannot be changed here.");
  await prisma.$transaction([
    prisma.workspaceMember.update({ where: { id: target.id }, data: { role } }),
    prisma.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "workspace.member.role", entityType: "WorkspaceMember", entityId: target.id, source: "account.team", beforeData: { role: target.role }, afterData: { role }, metadata: { email: target.user.email } } })
  ]);
  redirect(`${path}?roleUpdated=1`);
}

export async function removeWorkspaceMemberAction(formData: FormData): Promise<void> {
  const { user, workspace, membership, impersonation } = await requireWorkspace();
  const path = "/account/team";
  if (impersonation || !canManage(membership.role)) fail(path, "Only workspace owners and administrators can remove teammates.");
  const memberId = value(formData, "memberId", 120);
  const target = await prisma.workspaceMember.findFirst({ where: { id: memberId, workspaceId: workspace.id }, include: { user: { select: { id: true, email: true } } } });
  if (!target || target.role === "OWNER" || target.userId === user.id) fail(path, "The selected teammate cannot be removed here.");
  if (membership.role === "ADMIN" && target.role !== "MEMBER") fail(path, "Administrators can remove members, but only the owner can manage administrators.");
  await prisma.$transaction([
    prisma.workspaceMember.delete({ where: { id: target.id } }),
    prisma.userPreference.updateMany({ where: { userId: target.userId, activeWorkspaceId: workspace.id }, data: { activeWorkspaceId: null } }),
    prisma.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "workspace.member.remove", entityType: "WorkspaceMember", entityId: target.id, source: "account.team", metadata: { email: target.user.email, role: target.role } } })
  ]);
  redirect(`${path}?memberRemoved=1`);
}

export async function transferWorkspaceOwnershipAction(formData: FormData): Promise<void> {
  const { user, workspace, membership, impersonation } = await requireWorkspace();
  const path = "/account/team";
  if (impersonation || membership.role !== "OWNER") fail(path, "Only the current owner can transfer workspace ownership.");
  const memberId = value(formData, "memberId", 120);
  const confirmation = value(formData, "confirmation", 160);
  if (confirmation !== workspace.name) fail(path, "Type the exact workspace name to transfer ownership.");
  const target = await prisma.workspaceMember.findFirst({ where: { id: memberId, workspaceId: workspace.id, userId: { not: user.id } }, include: { user: { select: { id: true, email: true } } } });
  if (!target) fail(path, "Choose an existing teammate to become owner.");
  await prisma.$transaction(async (tx) => {
    await tx.workspaceMember.update({ where: { id: membership.id }, data: { role: "ADMIN" } });
    await tx.workspaceMember.update({ where: { id: target.id }, data: { role: "OWNER" } });
    await tx.workspace.update({ where: { id: workspace.id }, data: { ownerId: target.userId } });
    await tx.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "workspace.owner.transfer", entityType: "Workspace", entityId: workspace.id, source: "account.team", beforeData: { ownerUserId: user.id }, afterData: { ownerUserId: target.userId }, metadata: { newOwnerEmail: target.user.email } } });
  });
  redirect(`${path}?ownershipTransferred=1`);
}

export async function acceptWorkspaceInvitationAction(): Promise<void> {
  const session = await requireSession();
  if (session.impersonation) redirect("/jumps");
  const store = await cookies();
  const rawToken = store.get(WORKSPACE_INVITE_COOKIE)?.value ?? "";
  if (!rawToken) fail("/join", "The invitation link is missing. Open the original invitation again.");
  const now = new Date();
  const invitation = await prisma.workspaceInvitation.findFirst({ where: { tokenHash: hashWorkspaceInvitationToken(rawToken), status: "PENDING" } });
  if (!invitation || invitation.expiresAt <= now) {
    if (invitation?.status === "PENDING") await prisma.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
    store.delete(WORKSPACE_INVITE_COOKIE);
    fail("/join", "That workspace invitation is invalid or expired.");
  }
  if (normalizeInvitationEmail(session.user.email) !== normalizeInvitationEmail(invitation.email)) {
    fail("/join", `This invitation was sent to ${invitation.email}. Sign in with that email address.`);
  }
  await prisma.$transaction(async (tx) => {
    const claim = await tx.workspaceInvitation.updateMany({ where: { id: invitation.id, status: "PENDING", expiresAt: { gt: now } }, data: { status: "ACCEPTED", acceptedAt: now, acceptedByUserId: session.user.id } });
    if (claim.count !== 1) throw new Error("The invitation was already used.");
    await tx.workspaceMember.upsert({ where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: session.user.id } }, create: { workspaceId: invitation.workspaceId, userId: session.user.id, role: invitation.role }, update: {} });
    await tx.userPreference.upsert({ where: { userId: session.user.id }, create: { userId: session.user.id, activeWorkspaceId: invitation.workspaceId }, update: { activeWorkspaceId: invitation.workspaceId } });
    await tx.auditLog.create({ data: { workspaceId: invitation.workspaceId, actorType: "USER", actorUserId: session.user.id, action: "workspace.invitation.accept", entityType: "WorkspaceInvitation", entityId: invitation.id, source: "workspace.join", metadata: { role: invitation.role } } });
  });
  store.delete(WORKSPACE_INVITE_COOKIE);
  redirect(`/jumps?joined=${encodeURIComponent(invitation.workspaceId)}`);
}
