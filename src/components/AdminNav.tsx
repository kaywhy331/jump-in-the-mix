"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { AdminPermission } from "@/lib/admin-permissions";
import { activeAdminArea, adminNavigation } from "@/lib/admin-navigation";
import { AppIcon } from "@/components/AppIcon";

export function AdminNav({ permissions, tabs = false }: { permissions: AdminPermission[]; tabs?: boolean }) {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const active = activeAdminArea(pathname, permissions);
  const groups = adminNavigation(permissions);
  const selected = groups.find(group => group.items.some(item => item.href === active?.href));
  if (tabs) {
    if (!selected || selected.items.length < 2) return null;
    return <nav className="admin-content-tabs admin-area-tabs" aria-label={`${selected.label} pages`}>
      {selected.items.map(item => <Link key={item.href} href={item.href} aria-current={active?.href === item.href ? "page" : undefined}>{item.label}</Link>)}
    </nav>;
  }
  return <nav className="admin-sidebar" aria-label="Administration" data-open={open}>
    <div className="admin-sidebar-heading"><span>Administration</span>
      <button className="button admin-menu-toggle" type="button" aria-expanded={open} aria-controls="admin-navigation-links" onClick={() => setOpenPath(open ? null : pathname)}>
        {open ? "Close menu" : "Menu"}<AppIcon name={open ? "close" : "chevronDown"} />
      </button>
    </div>
    <div id="admin-navigation-links" className="admin-navigation-groups">
      <div className="admin-navigation-group">{groups.map(group => <Link key={group.label} href={group.items[0].href} aria-current={selected?.label === group.label ? "page" : undefined} onClick={() => setOpenPath(null)}>{group.label}</Link>)}</div>
    </div>
  </nav>;
}
