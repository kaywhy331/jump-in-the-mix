"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { AdminPermission } from "@/lib/admin-permissions";
import { activeAdminArea, adminNavigation } from "@/lib/admin-navigation";
import { AppIcon } from "@/components/AppIcon";

export function AdminNav({ permissions }: { permissions: AdminPermission[] }) {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const active = activeAdminArea(pathname, permissions);
  return (
    <nav className="admin-sidebar" aria-label="Administration" data-open={open}>
      <div className="admin-sidebar-heading"><span>Administration</span>
        <button className="button admin-menu-toggle" type="button" aria-expanded={open} aria-controls="admin-navigation-links" onClick={() => setOpenPath(open ? null : pathname)}>
          {open ? "Close menu" : "Menu"}<AppIcon name={open ? "close" : "chevronDown"} />
        </button>
      </div>
      <span className="admin-mobile-location">{active?.label ?? "Administration"}</span>
      <div id="admin-navigation-links" className="admin-navigation-groups">
        {adminNavigation(permissions).map(group => <div className="admin-navigation-group" key={group.label}>
          <p>{group.label}</p>
          {group.items.map(({ label, href }) => <Link aria-current={active?.href === href ? "page" : undefined} href={href} key={href} onClick={() => setOpenPath(null)}>{label}</Link>)}
        </div>)}
      </div>
    </nav>
  );
}
