"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AdminPermission } from "@/lib/admin-permissions";
import { activeAdminArea, adminNavigation } from "@/lib/admin-navigation";
import { AppIcon } from "@/components/AppIcon";

export function AdminNav({ permissions, tabs = false }: { permissions: AdminPermission[]; tabs?: boolean }) {
  // Staff navigation fetches on demand so changing permissions and queue data stay current.
  const pathname = usePathname();
  const tabsRef = useRef<HTMLElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const nav = tabsRef.current; if (!tabs || !nav) return;
    const measure = () => setOverflowing(nav.scrollWidth > nav.clientWidth + 1);
    const observer = new ResizeObserver(measure); observer.observe(nav); measure();
    return () => observer.disconnect();
  }, [tabs, pathname]);
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const active = activeAdminArea(pathname, permissions);
  const groups = adminNavigation(permissions);
  const sidebarRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // Like the public Explore menu, Escape and a tap outside close the phone menu.
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (event.target instanceof Node && !sidebarRef.current?.contains(event.target)) setOpenPath(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpenPath(null); toggleRef.current?.focus(); } };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open]);
  const selected = groups.find(group => group.items.some(item => item.href === active?.href));
  useEffect(() => { if (!tabs) return; for (const nav of document.querySelectorAll<HTMLElement>(".admin-content-tabs")) { const item = nav.querySelector<HTMLElement>('[aria-current="page"]'); if (item) { const a = item.getBoundingClientRect(), b = nav.getBoundingClientRect(); nav.scrollLeft += a.left - b.left - (b.width - a.width) / 2; } } }, [pathname, tabs]);
  if (tabs) {
    if (!selected || selected.items.length < 2) return null;
    return <div>{overflowing && <p className="admin-tabs-hint">{selected.label}: scroll for more pages →</p>}<nav ref={tabsRef} className="admin-content-tabs admin-area-tabs" aria-label={`${selected.label} pages`}>
      {selected.items.map(item => <Link prefetch={false} key={item.href} href={item.href} aria-current={active?.href === item.href ? "page" : undefined}>{item.label}</Link>)}
    </nav></div>;
  }
  return <nav ref={sidebarRef} className="admin-sidebar" aria-label="Administration" data-open={open}>
    <div className="admin-sidebar-heading"><span>Administration · {active?.label ?? "Overview"}</span>
      <button ref={toggleRef} className="button admin-menu-toggle" type="button" aria-expanded={open} aria-controls="admin-navigation-links" onClick={() => setOpenPath(open ? null : pathname)}>
        {open ? "Close menu" : "Menu"}<AppIcon name={open ? "close" : "chevronDown"} />
      </button>
    </div>
    <div id="admin-navigation-links" className="admin-navigation-groups">
      <div className="admin-navigation-group">{groups.map(group => <Link prefetch={false} key={group.label} href={group.items[0].href} aria-current={selected?.label === group.label ? "page" : undefined} onClick={() => setOpenPath(null)}>{group.label}</Link>)}</div>
    </div>
  </nav>;
}
