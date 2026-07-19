import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "More" };

const destinations = [
  ["/dashboard", "Overview", "Workspace progress and upcoming activity."],
  ["/templates", "Mix Templates", "Start from a reviewed follow-up plan."],
  ["/settings", "Settings", "Workspace profile, action templates, and Important Date types."],
  ["/account", "My Account", "Billing, integrations, security, sessions, and privacy."],
  ["/help", "Help & Support", "Answers, guides, and private support tickets."]
] as const;

export default function MorePage() {
  return <div className="page"><header className="page-header"><div><h1>More</h1><p>Workspace tools, account controls, and help.</p></div></header><div className="settings-hub-grid">{destinations.map(([href, title, description]) => <Link className="settings-hub-card" href={href} key={href}><span className="settings-hub-icon">→</span><span><strong>{title}</strong><small>{description}</small></span></Link>)}</div></div>;
}
