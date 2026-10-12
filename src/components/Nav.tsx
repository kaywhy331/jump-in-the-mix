"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { QuickAddButton } from "@/components/QuickAdd";

const links = [
  { href: "/jumps", label: "Today", icon: "home", kind: "primary" },
  { href: "/contacts", label: "Contacts", icon: "contacts", kind: "primary" },
  { href: "/mixes", label: "Mixes", icon: "mixes", kind: "primary" },
  { href: "/journey", label: "Journey", icon: "journey", kind: "desktop" },
  { href: "/calendar", label: "Calendar", icon: "calendar", kind: "desktop" },
  { href: "/more", label: "More", icon: "more", kind: "primary" }
] as const;

const accountLinks = [
  { href: "/settings", label: "Settings", icon: "settings" },
  { href: "/help", label: "Help", icon: "help" },
  { href: "/account", label: "My account", icon: "profile" }
] as const;

export function AccountNav() {
  const pathname = usePathname();
  return <nav className="sidebar-utilities" aria-label="Account and help">
    {accountLinks.map(({ href, label, icon }) => <Link key={href} href={href} aria-label={label}
      aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}>
      <AppIcon name={icon} />{label}
    </Link>)}
  </nav>;
}

export function Nav({ quickAdd = true }: { quickAdd?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="app-nav" aria-label="Primary navigation">
      {links.map(({ href, label, icon, kind }, index) => {
        const active = pathname === href || pathname.startsWith(`${href}/`) || (href === "/mixes" && pathname.startsWith("/templates")) || (href === "/more" && ["/settings", "/account", "/help", "/admin", "/calendar", "/journey"].some(root => pathname === root || pathname.startsWith(`${root}/`)));
        return <span className={kind === "desktop" ? "nav-desktop-item" : index === 2 ? "nav-with-quick-add" : undefined} key={href}>{index === 2 && quickAdd && <QuickAddButton mobile />}<Link href={href} aria-current={active ? "page" : undefined} className={`nav-link nav-${kind}${href === "/more" ? " nav-more" : ""}${active ? " active" : ""}`}><AppIcon name={icon as AppIconName}/><span>{label}</span></Link></span>;
      })}
    </nav>
  );
}
