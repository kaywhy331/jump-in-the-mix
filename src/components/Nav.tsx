"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["/dashboard", "Home", "⌂"],
  ["/jumps", "Jumps", "↗"],
  ["/contacts", "Contacts", "◎"],
  ["/mixes", "Mixes", "⎇"],
  ["/settings", "Settings", "⚙"],
  ["/help", "Help", "?"]
] as const;

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="app-nav" aria-label="Primary navigation">
      {links.map(([href, label, icon]) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} className={active ? "nav-link active" : "nav-link"}>
            <span aria-hidden="true">{icon}</span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
