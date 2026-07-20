import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { logoutAction } from "@/lib/auth-actions";

export const metadata: Metadata = { title: "More" };

const destinations = [
  ["/settings", "Settings", "Workspace profile, action templates, and Important Date types."],
  ["/account", "My Account", "Billing, integrations, security, sessions, and privacy."],
  ["/help", "Help & Support", "Answers, guides, and private support tickets."]
] as const;

export default async function MorePage() {
  const { session } = await requireWorkspace();
  return <div className="page more-page"><header className="page-header"><div><h1>More</h1><p>Workspace tools, account controls, and help.</p></div></header><div className="settings-hub-grid">{destinations.map(([href, title, description], index) => <div className="more-destination" key={href}><span className="more-section-label">{index === 0 ? "Workspace" : index === 1 ? "Account" : "Support"}</span><Link className="settings-hub-card" href={href}><span><strong>{title}</strong><small>{description}</small></span><span className="settings-row-chevron" aria-hidden="true">›</span></Link></div>)}<Link className="settings-hub-card" href="/account#referrals"><span><strong>Referrals</strong><small>Share Jump in the Mix and review rewards.</small></span><span className="settings-row-chevron" aria-hidden="true">›</span></Link>{session.authUser.isPlatformAdmin && <Link className="settings-hub-card" href="/admin"><span><strong>Admin</strong><small>Platform operations and support controls.</small></span><span className="settings-row-chevron" aria-hidden="true">›</span></Link>}</div><form action={logoutAction} className="more-sign-out"><button className="button" type="submit">Sign out</button></form></div>;
}
