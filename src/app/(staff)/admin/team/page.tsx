import { Notice } from "@/components/Notice";
import { ADMIN_PERMISSIONS, effectiveAdminPermissions, STAFF_ROLES } from "@/lib/admin-permissions";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveStaffAccessAction } from "@/lib/staff-actions";
import Link from "next/link";
import { sendStaffInvitationAction, changeStaffInvitationAction } from "@/lib/staff-invitation-actions";
import { EMAIL_RETRY_WINDOW_MS } from "@/lib/email-budget";

export const metadata = { title: "Admin · Team" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string; invitation?: string; invitePage?: string }> }) {
  await requirePlatformAdmin("staff.manage");
  const params = await searchParams;
  const staff = await prisma.staffMembership.findMany({ include: { user: { select: { email: true, name: true } } }, orderBy: { createdAt: "asc" }, take: 100 });
  const mfa = await prisma.adminMfaCredential.findMany({ where: { userId: { in: staff.map(s => s.userId) } }, select: { userId: true, enabledAt: true } });
  const invitePage = Math.min(10_000, Math.max(1, Number.parseInt(params.invitePage ?? "1", 10) || 1));
  const [invitations, invitationCount] = await Promise.all([
    prisma.staffInvitation.findMany({ select: { id: true, email: true, role: true, grants: true, denies: true, createdAt: true, expiresAt: true, acceptedAt: true, revokedAt: true, lastSentAt: true,
      delivery: { select: { status: true, attempts: true, firstAttemptAt: true, providerId: true, lastError: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20, skip: (invitePage - 1) * 20 }),
    prisma.staffInvitation.count()
  ]);
  const date = (value: Date) => value.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  return <div className="page"><header className="page-header"><div><h1>Admin · Team</h1><p>Give each person only the access they need. Saving signs that person out and closes their support views.</p></div></header>
    {params.error && <Notice type="error">{params.error}</Notice>}{params.saved && <Notice>Staff access updated. The person must sign in again.</Notice>}
    {params.invitation === "queued" && <Notice>Staff invitation queued. The worker will send the email. The person must accept and set up MFA before using admin tools.</Notice>}
    {params.invitation === "updated" && <Notice>Staff invitation updated. Review its current status below.</Notice>}
    <section className="card form-stack"><h2>Invite a new staff account</h2><p>Send a personal invitation to someone who does not have an account. It lasts seven days and creates staff access without a customer workspace. Existing verified accounts can use Add staff access below.</p>
      <form action={sendStaffInvitationAction} className="form-stack">
        <label className="field"><span>New staff email</span><input type="email" name="email" maxLength={254} required /></label>
        <label className="field"><span>Initial staff role</span><select name="role" defaultValue="SUPPORT">{STAFF_ROLES.filter(role => role !== "OWNER").map(role => <option key={role}>{role}</option>)}</select></label>
        <details><summary>Set individual permissions before acceptance</summary><fieldset><legend>Invitation permission overrides</legend><p>Role defaults apply. A denial wins. Owner promotion happens separately after MFA enrollment.</p>
          {Object.entries(ADMIN_PERMISSIONS).filter(([permission]) => permission !== "staff.manage").map(([permission, label]) => <div key={permission}><strong>{label}</strong><label><input type="checkbox" name="grant" value={permission} /> Grant {label.toLowerCase()}</label><label><input type="checkbox" name="deny" value={permission} /> Deny {label.toLowerCase()}</label></div>)}
        </fieldset></details>
        <label className="field"><span>Reason for staff invitation</span><input name="reason" minLength={10} maxLength={500} required /></label>
        <label className="field"><span>Your Owner password</span><input type="password" name="currentPassword" autoComplete="current-password" maxLength={72} required /></label>
        <button className="button primary" type="submit">Send staff invitation</button>
      </form>
      <p>Invitations are sent inside the system. Secret setup URLs are never displayed here. Changing the issuing Owner’s staff access revokes their unused invitations.</p>
    </section>
    <section className="card form-stack"><h2>Staff invitation history · {invitationCount}</h2>
      {!invitations.length && <p>No staff invitations yet.</p>}
      {invitations.map(invite => {
        const active = !invite.acceptedAt && !invite.revokedAt && invite.expiresAt > new Date();
        const retry = active && invite.delivery?.status === "REVIEW" && invite.delivery.firstAttemptAt && Date.now() - invite.delivery.firstAttemptAt.getTime() < EMAIL_RETRY_WINDOW_MS;
        return <article key={invite.id} className="card form-stack" style={{ overflowWrap: "anywhere" }}><h3>{invite.email}</h3>
          <p>{invite.role} · {invite.acceptedAt ? "Accepted" : invite.revokedAt ? "Revoked" : invite.expiresAt <= new Date() ? "Expired" : invite.delivery?.status ?? "Pending"}</p>
          <p>Offered access: {effectiveAdminPermissions({ role: invite.role, status: "ACTIVE", grants: invite.grants, denies: invite.denies }).map(permission => ADMIN_PERMISSIONS[permission]).join(", ") || "None"}.</p>
          <p>Created {date(invite.createdAt)} · Expires {date(invite.expiresAt)}</p>
          {invite.lastSentAt && <p>Provider accepted {date(invite.lastSentAt)}. This does not prove inbox delivery.</p>}
          {invite.delivery?.providerId && <p>Provider record {invite.delivery.providerId}</p>}
          {invite.delivery?.lastError && <p>{invite.delivery.lastError}</p>}
          {active && <form action={changeStaffInvitationAction} className="form-stack"><input type="hidden" name="invitationId" value={invite.id} />
            <label className="field"><span>Reason for invitation change</span><input name="reason" minLength={10} maxLength={500} required /></label>
            <label className="field"><span>Your Owner password</span><input type="password" name="currentPassword" autoComplete="current-password" maxLength={72} required /></label>
            <div className="form-actions"><button className="button" name="operation" value="revoke">Revoke staff invitation</button>{retry && <button className="button" name="operation" value="retry">Retry same staff invitation</button>}</div>
          </form>}
          {active && invite.delivery?.status === "REVIEW" && !retry && <p>Inspect the provider record before revoking and replacing this invitation. The original safe retry window has ended.</p>}
        </article>;
      })}
      <nav className="page-actions" aria-label="Staff invitation pages">{invitePage > 1 && <Link href={`/admin/team?invitePage=${invitePage - 1}`}>Previous invitations</Link>}<span>Page {invitePage}</span>{invitePage * 20 < invitationCount && <Link href={`/admin/team?invitePage=${invitePage + 1}`}>Next invitations</Link>}</nav>
    </section>
    <section className="card form-stack"><h2>Add staff access</h2><p>Start with an existing verified account. New staff begin with their selected role; owners can grant or deny individual permissions below.</p>
      <form action={saveStaffAccessAction} className="form-stack"><input type="hidden" name="revision" value="0" /><input type="hidden" name="status" value="ACTIVE" />
        <label className="field"><span>Account email</span><input type="email" name="email" maxLength={254} required /></label>
        <label className="field"><span>Role</span><select name="role" defaultValue="SUPPORT">{STAFF_ROLES.map(role => <option key={role}>{role}</option>)}</select></label>
        <label className="field"><span>Reason</span><input name="reason" minLength={10} maxLength={500} required /></label>
        <label className="field"><span>Your current password</span><input type="password" name="currentPassword" autoComplete="current-password" maxLength={72} required /></label>
        <button className="button primary" type="submit">Add staff access</button>
      </form>
    </section>
    {staff.map(member => <section className="card form-stack" key={member.id} style={{ overflowWrap: "anywhere" }}>
      <h2>{member.user.name}</h2><p>{member.user.email} · {member.status} · MFA {mfa.some(m => m.userId === member.userId && m.enabledAt) ? "enabled" : "needs setup"}</p>
      <p>Effective access: {effectiveAdminPermissions(member).map(p => ADMIN_PERMISSIONS[p]).join(", ") || "None"}.</p>
      <details><summary>Change role and permissions</summary><form action={saveStaffAccessAction} className="form-stack">
        <input type="hidden" name="email" value={member.user.email} /><input type="hidden" name="revision" value={member.revision} />
        <label className="field"><span>Role for {member.user.name}</span><select name="role" defaultValue={member.role}>{STAFF_ROLES.map(role => <option key={role}>{role}</option>)}</select></label>
        <label className="field"><span>Staff status</span><select name="status" defaultValue={member.status}><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option></select></label>
        <fieldset><legend>Individual permission overrides</legend><p>Role defaults apply unless overridden. A denial wins over a grant. Staff management belongs to owners only.</p>
          {Object.entries(ADMIN_PERMISSIONS).map(([permission, label]) => <div key={permission}><strong>{label}</strong><label><input type="checkbox" name="grant" value={permission} defaultChecked={member.grants.includes(permission)} /> Grant {label.toLowerCase()}</label><label><input type="checkbox" name="deny" value={permission} defaultChecked={member.denies.includes(permission)} /> Deny {label.toLowerCase()}</label></div>)}
        </fieldset>
        <label className="field"><span>Reason for access change</span><input name="reason" minLength={10} maxLength={500} required /></label>
        <label className="field"><span>Your current password</span><input type="password" name="currentPassword" autoComplete="current-password" maxLength={72} required /></label>
        <button className="button" type="submit">Save access and end sessions</button>
      </form></details>
    </section>)}
    {staff.length === 100 && <Notice type="info">Showing the first 100 staff memberships. Contact the operator before adding more staff.</Notice>}
  </div>;
}
