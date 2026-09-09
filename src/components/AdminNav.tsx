"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_AREAS, type AdminPermission } from "@/lib/admin-permissions";

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNav({ permissions }: { permissions: AdminPermission[] }) {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="Administration">
      {ADMIN_AREAS.filter(item => permissions.includes(item.permission)).map(({ label, href }) => (
        <Link className={isActive(pathname, href) ? "active" : ""} href={href} key={href}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
