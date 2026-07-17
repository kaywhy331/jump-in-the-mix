"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({ current }: { current?: string }) {
  const pathname = usePathname();
  const activePath = current ?? pathname;
  return (
    <nav className="admin-nav" aria-label="Administration">
      {items.map(([label, href]) => (
        <Link className={isActive(activePath, href) ? "active" : ""} href={href} key={href}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
