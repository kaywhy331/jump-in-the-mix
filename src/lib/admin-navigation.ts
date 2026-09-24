import { ADMIN_AREAS, type AdminPermission } from "@/lib/admin-permissions";

const GROUPS = [
  { label: "Overview", paths: ["/admin"] },
  { label: "Customers", paths: ["/admin/users"] },
  { label: "Access", paths: ["/admin/waitlist", "/admin/access", "/admin/admission"] },
  { label: "Support", paths: ["/admin/support"] },
  { label: "Content", paths: ["/admin/templates", "/admin/marketplace", "/admin/system-mix", "/admin/settings"] },
  { label: "Reports", paths: ["/admin/reports", "/admin/reports/history", "/admin/reports/exports"] },
  { label: "Operations", paths: ["/admin/operations", "/admin/operations/alerts", "/admin/email", "/admin/email/recovery", "/admin/email/suppressions", "/admin/audit"] },
  { label: "Settings", paths: ["/admin/team"] }
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

export function firstAdminDestination(permissions: readonly AdminPermission[]) {
  return adminNavigation(permissions)[0]?.items[0]?.href ?? "/account/admin-mfa";
}

/** Restrict return links to local staff pages, including query state. Never trust a supplied URL. */
export function safeAdminReturnTo(value: string | undefined | null, fallback = "/admin"): string {
  if (!value || value.length > 2000 || /[\\\r\n]/.test(value)) return fallback;
  try {
    const parsed = new URL(value, "https://admin.invalid");
    if (parsed.origin !== "https://admin.invalid" || !value.startsWith("/")) return fallback;
    if (parsed.pathname !== "/admin" && !parsed.pathname.startsWith("/admin/")) return fallback;
    if (parsed.pathname === "/admin/access-denied") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch { return fallback; }
}

export function adminQuery(path: string, params: Record<string, string | number | undefined | null>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  return query.size ? `${path}?${query}` : path;
}

export function adminPage(value: string | undefined) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100000) : 1;
}

export function adminActionDestination(data: FormData, fallback: string, updates: Record<string, string> = {}) {
  const url = new URL(safeAdminReturnTo(String(data.get("returnTo") ?? ""), fallback), "https://admin.invalid");
  for (const key of ["error", "saved", "done", "queued", "cleared", "recovered", "updated", "retried"]) url.searchParams.delete(key);
  for (const [key, value] of Object.entries(updates)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}
