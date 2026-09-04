"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { QuickAddButton } from "@/components/QuickAdd";

const links = [
  { href: "/jumps", label: "Today", icon: "today", kind: "primary" },
  { href: "/contacts", label: "Contacts", icon: "contacts", kind: "primary" },
  { href: "/mixes", label: "Plans", icon: "mixes", kind: "primary" },
  { href: "/more", label: "More", icon: "more", kind: "primary" }
] as const;

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="app-nav" aria-label="Primary navigation">
      {links.map(({ href, label, icon, kind }, index) => {
        const active = pathname === href || pathname.startsWith(`${href}/`) || (href === "/mixes" && pathname.startsWith("/templates"));
        return <span className={index === 2 ? "nav-with-quick-add" : undefined} key={href}>{index === 2 && <QuickAddButton mobile />}<Link href={href} className={`nav-link nav-${kind}${active ? " active" : ""}`}><AppIcon name={icon as AppIconName}/><span>{label}</span></Link></span>;
      })}
    </nav>
  );
}
