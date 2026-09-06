import type { Metadata } from "next";
import Link from "next/link";
import { logoutAction } from "@/lib/auth-actions";

export const metadata: Metadata = { title: "More" };

const destinations = [
  ["/journey", "Customer journey", "Track stages and let milestones start the right follow-ups."],
  ["/calendar", "Calendar", "Schedule meetings and protect your time."],
  ["/settings/connections", "Lead connections", "Bring contacts in from forms, messages, and other tools."],
  ["/settings", "Settings", "Business details, saved messages, dates, and personal preferences."],
  ["/account", "My Account", "Profile, password, active sessions, export, and account deletion."],
  ["/help", "Help", "Plain-language answers and ways to get assistance."]
] as const;

export default async function MorePage() {
  return <div className="page more-page"><header className="page-header"><div><h1>More</h1><p>Business settings, account controls, and help.</p></div></header><div className="settings-hub-grid"><Link className="settings-hub-card desktop-only" href="/jumps"><span className="settings-hub-icon">→</span><span><strong>Today</strong><small>Who to contact next and what to say.</small></span></Link><Link className="settings-hub-card desktop-only" href="/templates"><span className="settings-hub-icon">→</span><span><strong>Ready-made plans</strong><small>Start with follow-ups written for your business.</small></span></Link>{destinations.map(([href, title, description]) => <div className="more-destination" key={href}><span className="more-section-label">{title}</span><Link className="settings-hub-card" href={href}><span className="settings-hub-icon desktop-only">→</span><span><strong>{title}</strong><small>{description}</small></span><span className="settings-row-chevron mobile-only" aria-hidden="true">›</span></Link></div>)}</div><form action={logoutAction} className="more-sign-out"><button className="button" type="submit">Sign out</button></form></div>;
}
