import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/lib/auth-actions";

export const metadata: Metadata = { title: "More" };

const destinations = [
  ["/settings", "Settings", "Personal preferences, action templates, and Important Date types."],
  ["/account", "My Account", "Profile, password, active sessions, export, and account deletion."],
  ["/help", "Help & Support", "Answers, guides, and private support tickets."]
] as const;

export default async function MorePage() {
  return <div className="page more-page"><header className="page-header"><div><h1>More</h1><p>Personal settings, account controls, and help.</p></div></header><div className="settings-hub-grid"><Link className="settings-hub-card desktop-only" href="/jumps"><span className="settings-hub-icon">→</span><span><strong>Today</strong><small>Your queue, upcoming moments, and completed actions.</small></span></Link><Link className="settings-hub-card desktop-only" href="/templates"><span className="settings-hub-icon">→</span><span><strong>Mix Templates</strong><small>Start from a reviewed follow-up plan.</small></span></Link>{destinations.map(([href, title, description], index) => <div className="more-destination" key={href}><span className="more-section-label">{index === 0 ? "Preferences" : index === 1 ? "Account" : "Support"}</span><Link className="settings-hub-card" href={href}><span className="settings-hub-icon desktop-only">→</span><span><strong>{title}</strong><small>{description}</small></span><span className="settings-row-chevron mobile-only" aria-hidden="true">›</span></Link></div>)}</div><form action={logoutAction} className="more-sign-out"><button className="button" type="submit">Sign out</button></form></div>;
}
