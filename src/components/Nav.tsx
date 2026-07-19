"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/jumps", label: "Today", icon: "✓", kind: "primary" },
  { href: "/contacts", label: "Contacts", icon: "◎", kind: "primary" },
  { href: "/mixes", label: "Mixes", icon: "⎇", kind: "primary" },
  { href: "/dashboard", label: "Overview", icon: "⌂", kind: "secondary" },
  { href: "/settings", label: "Settings", icon: "⚙", kind: "secondary" },
  { href: "/help", label: "Help", icon: "?", kind: "secondary" },
  { href: "/more", label: "More", icon: "•••", kind: "mobile" }
] as const;

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="app-nav" aria-label="Primary navigation">
      {links.map(({ href, label, icon, kind }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return <Link key={href} href={href} className={`nav-link nav-${kind}${active ? " active" : ""}`}><span aria-hidden="true">{icon}</span><span>{label}</span></Link>;
      })}
    </nav>
  );
}
