export const ADMIN_PERMISSIONS = {
  "dashboard.read": "View aggregate dashboard",
  "reports.read": "View aggregate reports",
  "waitlist.read": "View waitlist emails and history",
  "waitlist.manage": "Send manual waitlist invitations",
  "waves.pause": "Pause or resume automatic waves",
  "access.read": "View access grants",
  "access.revoke": "Revoke access grants",
  "users.read": "View account metadata",
  "users.suspend": "Suspend accounts",
  "sessions.revoke": "End account sessions",
  "support.manage": "Read and manage support tickets",
  "support.view_customer": "Open audited customer support views",
  "mixes.edit": "Edit library and System Mix drafts",
  "mixes.publish": "Publish library and System Mix versions",
  "operations.read": "View operational diagnostics",
  "operations.manage": "Acknowledge operational alerts",
  "email.manage": "Review email recovery and recipient suppression",
  "jobs.retry": "Retry background jobs",
  "audit.read": "Read platform and workspace audit records",
  "settings.manage": "Manage system settings",
  "staff.manage": "Manage staff and permissions"
} as const;

export type AdminPermission = keyof typeof ADMIN_PERMISSIONS;
export const STAFF_ROLES = ["OWNER", "OPERATOR", "GROWTH", "EDITOR", "SUPPORT", "ANALYST"] as const;
export type AdminRole = typeof STAFF_ROLES[number];
export type StaffAccess = { role: AdminRole; status: "ACTIVE" | "DISABLED"; grants: string[]; denies: string[] };

export const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  // Customer-content access is an explicit, separately audited grant, even for owners.
  OWNER: (Object.keys(ADMIN_PERMISSIONS) as AdminPermission[]).filter(p => p !== "support.view_customer"),
  OPERATOR: ["dashboard.read", "reports.read", "access.read", "access.revoke", "users.read", "users.suspend", "sessions.revoke", "operations.read", "operations.manage", "jobs.retry", "audit.read"],
  GROWTH: ["dashboard.read", "reports.read", "waitlist.read", "waitlist.manage", "waves.pause", "access.read"],
  EDITOR: ["dashboard.read", "mixes.edit"],
  SUPPORT: ["dashboard.read", "users.read", "support.manage"],
  ANALYST: ["dashboard.read", "reports.read"]
};

export function isAdminPermission(value: string): value is AdminPermission {
  return Object.hasOwn(ADMIN_PERMISSIONS, value);
}

export function hasAdminPermission(staff: StaffAccess | null | undefined, permission: AdminPermission): boolean {
  if (!staff || staff.status !== "ACTIVE" || !STAFF_ROLES.includes(staff.role) || !isAdminPermission(permission)) return false;
  if (permission === "staff.manage" && staff.role !== "OWNER") return false;
  return !staff.denies.includes(permission) && (staff.grants.includes(permission) || ROLE_PERMISSIONS[staff.role].includes(permission));
}

export function effectiveAdminPermissions(staff: StaffAccess | null | undefined): AdminPermission[] {
  return (Object.keys(ADMIN_PERMISSIONS) as AdminPermission[]).filter(p => hasAdminPermission(staff, p));
}

export const ADMIN_AREAS: ReadonlyArray<{ label: string; href: string; permission: AdminPermission }> = [
  { label: "Overview", href: "/admin", permission: "dashboard.read" },
  { label: "Reports", href: "/admin/reports", permission: "reports.read" },
  { label: "Users", href: "/admin/users", permission: "users.read" },
  { label: "Waitlist", href: "/admin/waitlist", permission: "waitlist.read" },
  { label: "Invitations", href: "/admin/access", permission: "access.read" },
  { label: "Email recovery", href: "/admin/email/recovery", permission: "email.manage" },
  { label: "Support", href: "/admin/support", permission: "support.manage" },
  { label: "Ready-made mixes", href: "/admin/templates", permission: "mixes.edit" },
  { label: "System Mix", href: "/admin/system-mix", permission: "mixes.edit" },
  { label: "Operations", href: "/admin/operations", permission: "operations.read" },
  { label: "Email", href: "/admin/email", permission: "operations.read" },
  { label: "Audit", href: "/admin/audit", permission: "audit.read" },
  { label: "Admission", href: "/admin/admission", permission: "settings.manage" },
  { label: "System Settings", href: "/admin/settings", permission: "settings.manage" },
  { label: "Team", href: "/admin/team", permission: "staff.manage" }
];
