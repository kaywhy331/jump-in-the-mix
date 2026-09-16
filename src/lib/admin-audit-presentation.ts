import type { AdminPermission } from "@/lib/admin-permissions";
import { redactedAuditData } from "@/lib/audit-redaction";
export function adminAuditEntityHref(type: string, id: string | null, permissions: readonly AdminPermission[]) {
  if (!id) return null;
  const routes: Record<string, [AdminPermission, string]> = {
    User: ["users.read", `/admin/users/${encodeURIComponent(id)}`],
    SupportTicket: ["support.manage", `/admin/support/${encodeURIComponent(id)}`],
    SharedMix: ["mixes.edit", `/admin/templates/${encodeURIComponent(id)}/edit`],
    ReferralAccessInvite: ["access.read", `/admin/access/${encodeURIComponent(id)}`],
    Job: ["operations.read", `/admin/operations?view=jobs&status=all&jobId=${encodeURIComponent(id)}`],
    StaffMembership: ["staff.manage", `/admin/team?q=${encodeURIComponent(id)}`],
    PlatformSetting: ["settings.manage", "/admin/settings"],
    AdmissionPolicy: ["settings.manage", "/admin/admission"]
  };
  const route = routes[type];
  return route && permissions.includes(route[0]) ? route[1] : null;
}
export function auditChangeSummary(before: unknown, after: unknown): string | null {
  const left = redactedAuditData(before), right = redactedAuditData(after);
  if (!left || !right || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) || Array.isArray(right)) return null;
  const previous = left as Record<string, unknown>, next = right as Record<string, unknown>;
  const fields = [...new Set([...Object.keys(previous), ...Object.keys(next)])].filter(key => JSON.stringify(previous[key]) !== JSON.stringify(next[key]));
  return fields.length ? `Changed: ${fields.map(key => key.replaceAll(/([A-Z])/g, " $1").toLowerCase()).join(", ")}.` : null;
}
