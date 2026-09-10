import { ADMIN_AREAS, type AdminPermission } from "@/lib/admin-permissions";

const GROUPS = [
  { label: "Workspace", paths: ["/admin", "/admin/reports"] },
  { label: "People", paths: ["/admin/users", "/admin/waitlist", "/admin/access", "/admin/support"] },
  { label: "Content", paths: ["/admin/templates", "/admin/system-mix"] },
  { label: "Operations", paths: ["/admin/operations", "/admin/email", "/admin/email/recovery", "/admin/audit"] },
  { label: "Settings", paths: ["/admin/team", "/admin/admission", "/admin/settings"] }
];

export function adminNavigation(permissions: readonly AdminPermission[]) {
  return GROUPS.map(group => ({
    label: group.label,
    items: group.paths.flatMap(href => ADMIN_AREAS.filter(area => area.href === href && permissions.includes(area.permission)))
  })).filter(group => group.items.length > 0);
}

export function activeAdminArea(pathname: string, permissions: readonly AdminPermission[]) {
  return ADMIN_AREAS.filter(area => permissions.includes(area.permission)
    && (pathname === area.href || (area.href !== "/admin" && pathname.startsWith(`${area.href}/`))))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
