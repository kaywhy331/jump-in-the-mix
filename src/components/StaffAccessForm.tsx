"use client";
import { useEffect, useRef } from "react";
import { ADMIN_PERMISSIONS, effectiveAdminPermissions, STAFF_ROLES, type AdminRole, type AdminPermission } from "@/lib/admin-permissions";
import { useAdminDraft } from "@/components/AdminDraftProvider";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { saveStaffAccessAction, addStaffAccessAction } from "@/lib/staff-actions";
const descriptions: Record<AdminRole,string> = {
  OWNER: "Full administration and staff management. Customer support views still need a separate grant.",
  OPERATOR: "Account and invitation access, operational diagnostics, job retries and audit review.",
  GROWTH: "Waitlist invitations, wave scheduling, access records and aggregate reports.",
  EDITOR: "Overview and content drafts. Publication requires a separate grant.",
  SUPPORT: "Account metadata and support tickets. Customer workspace views need a separate grant.",
  ANALYST: "Overview and aggregate reports. No customer records or operational changes."
};
const taskGroups = [
  { title: "Reports and oversight", prefixes: ["dashboard", "reports", "audit"] },
  { title: "Invitations and admission", prefixes: ["waitlist", "waves", "access"] },
  { title: "Accounts and customer support", prefixes: ["users", "sessions", "support"] },
  { title: "Content and configuration", prefixes: ["mixes", "settings"] },
  { title: "Operations and delivery", prefixes: ["operations", "email", "jobs"] },
  { title: "Staff access", prefixes: ["staff"] }
];
type Override = "default" | "allow" | "deny";
export function StaffAccessForm({ email, role = "SUPPORT", status = "ACTIVE", grants = [], denies = [], revision = 0, mfaEnabled = false, mode = "existing", returnTo, saved }: {
  email: string; role?: AdminRole; status?: "ACTIVE" | "DISABLED"; grants?: string[]; denies?: string[]; revision?: number; mfaEnabled?: boolean; mode?: "existing" | "new" | "add"; returnTo: string; saved?: string;
}) {
  const draft = useAdminDraft(`staff:${email}`, { role, status, revision, reason: "", overrides: Object.fromEntries(Object.keys(ADMIN_PERMISSIONS).map(permission => [permission, denies.includes(permission) ? "deny" : grants.includes(permission) ? "allow" : "default"])) as Record<string, Override> });
  const cleared = useRef<string | undefined>(undefined);
  useEffect(() => { if (saved && cleared.current !== saved) { cleared.current = saved; draft.clear(); } }, [saved,draft]);
  const current = draft.value;
  const nextGrants = Object.entries(current.overrides).filter(([permission,value]) => value === "allow" && permission !== "staff.manage").map(([permission]) => permission);
  const nextDenies = Object.entries(current.overrides).filter(([permission,value]) => value === "deny" && permission !== "staff.manage").map(([permission]) => permission);
  const effective = effectiveAdminPermissions({ role: current.role, status: current.status, grants: nextGrants, denies: nextDenies });
  const previous = effectiveAdminPermissions({ role, status, grants, denies });
  const added = effective.filter(permission => !previous.includes(permission)), removed = previous.filter(permission => !effective.includes(permission));
  const conflict = current.revision !== revision;
  return <form action={mode === "existing" ? saveStaffAccessAction : addStaffAccessAction} className="form-stack admin-staff-access-form" onSubmit={event => { if (conflict) event.preventDefault(); const form = event.currentTarget; window.setTimeout(() => { const password = form.querySelector<HTMLInputElement>('input[type="password"]'); if (password) password.value = ""; },0); }}>
    <input type="hidden" name="email" value={email} /><input type="hidden" name="revision" value={current.revision} /><input type="hidden" name="returnTo" value={returnTo} />
    {nextGrants.map(permission => <input key={permission} name="grant" type="hidden" value={permission} />)}{nextDenies.map(permission => <input key={permission} name="deny" type="hidden" value={permission} />)}
    {conflict && <div className="notice error" role="alert"><p>This staff record changed. Review the current role and permissions before replacing them with this draft.</p><button className="button" type="button" onClick={() => draft.set({ ...current, revision })}>I reviewed the latest access; keep my draft</button></div>}
    <div className="form-grid"><label className="field"><span>Staff role</span><select name="role" value={current.role} onChange={event => draft.set({ ...current, role: event.target.value as AdminRole })}>{STAFF_ROLES.filter(value => value !== "OWNER" || mfaEnabled).map(value => <option key={value} value={value}>{value[0]+value.slice(1).toLowerCase()}</option>)}</select><small>{descriptions[current.role]}</small>{!mfaEnabled && <small>Owner requires this person to enable MFA first. Ask them to sign in and open <a href="/account/admin-mfa">Administrator MFA</a> to enroll, then return here to promote them.</small>}</label>
    {mode === "existing" ? <label className="field"><span>Staff status</span><select name="status" value={current.status} onChange={event => draft.set({ ...current, status: event.target.value as typeof status })}><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option></select></label> : <input name="status" type="hidden" value="ACTIVE" />}</div>
    <details><summary>Individual permission overrides ({Object.values(current.overrides).filter(value => value !== "default").length})</summary><p>Use the role default, explicitly allow, or explicitly deny each capability. Staff management is fixed by the Owner role.</p><div>{taskGroups.map(group => <fieldset key={group.title}><legend>{group.title}</legend>{Object.entries(ADMIN_PERMISSIONS).filter(([permission]) => group.prefixes.includes(permission.split(".")[0])).map(([permission,label]) => <label className="field admin-permission-row" key={permission}><span>{label}<small>Effective: {effective.includes(permission as AdminPermission) ? "Allowed" : "Not allowed"}</small></span><select aria-label={`Override: ${label}`} disabled={permission === "staff.manage"} value={permission === "staff.manage" ? "default" : current.overrides[permission] ?? "default"} onChange={event => draft.set({ ...current, overrides: { ...current.overrides, [permission]: event.target.value as Override } })}><option value="default">Role default</option><option value="allow">Allow</option><option value="deny">Deny</option></select></label>)}</fieldset>)}</div></details>
    <section className="notice info" aria-live="polite"><strong>Proposed access: {effective.length} capabilities</strong><p>{mode === "new" ? "The recipient accepts this offer and enrolls MFA before using admin tools." : "Ends sessions and support views. Revokes their staff invitations. Sign-in required again."}</p>{added.length > 0 && <p>Added: {added.map(permission => ADMIN_PERMISSIONS[permission]).join(", ")}.</p>}{removed.length > 0 && <p>Removed: {removed.map(permission => ADMIN_PERMISSIONS[permission]).join(", ")}.</p>}<details><summary>Review all effective access</summary><ul>{effective.map(permission => <li key={permission}>{ADMIN_PERMISSIONS[permission]}</li>)}</ul></details></section>
    <div className="form-grid"><label className="field"><span>Reason for access change</span><input name="reason" value={current.reason} onChange={event => draft.set({ ...current, reason: event.target.value })} minLength={10} maxLength={500} required /></label><label className="field"><span>Your Owner password</span><input name="currentPassword" type="password" autoComplete="current-password" maxLength={72} required /></label></div><p className="admin-result-summary">Draft kept for 30 minutes in this tab. Review and submit after MFA.</p>
    <FormSubmitButton label={mode === "new" ? "Send staff invitation" : mode === "add" ? "Add staff access" : "Save access and end sessions"} pendingLabel="Saving staff access…" />
  </form>;
}
