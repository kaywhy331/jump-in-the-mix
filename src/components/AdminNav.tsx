import Link from "next/link";

const items = [
  ["Overview", "/admin"],
  ["Users", "/admin/users"],
  ["Billing", "/admin/billing"],
  ["Support", "/admin/support"],
  ["Mix Templates", "/admin/templates"],
  ["Integrations", "/admin/integrations"],
  ["Referrals", "/admin/referrals"],
  ["Operations", "/admin/operations"],
  ["Audit", "/admin/audit"],
  ["System Settings", "/admin/settings"]
] as const;

export function AdminNav({ current }: { current: string }) {
  return (
    <nav className="admin-nav" aria-label="Administration">
      {items.map(([label, href]) => (
        <Link className={current === href ? "active" : ""} href={href} key={href}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
