import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { logoutAction } from "@/lib/auth-actions";

export const metadata: Metadata = { title: "More" };

const destinations = [
  ["/account/preferences", "Preferences", "Personal identity, scheduling, quiet hours, weekends, and notifications."],
  ["/account/team", "Team", "Workspace invitations, roles, ownership, and members."],
  ["/account", "Account & billing", "Plan, integrations, password, sessions, and privacy."],
  ["/settings", "Workspace settings", "Workspace profile, Action Templates, and Important Date types."],
  ["/notifications", "Notifications", "Relationship, import, integration, support, billing, and security updates."],
  ["/help", "Help & Support", "Answers, guides, and private support tickets."]
] as const;

export default async function MorePage() {
  const { session, membership } = await requireWorkspace();
  return <div className="page more-page"><header className="page-header"><div><h1>More</h1><p>Account, workspace, team, privacy, and support controls.</p></div></header><div className="settings-hub-grid"><Link className="settings-hub-card desktop-only" href="/jumps"><span className="settings-hub-icon">→</span><span><strong>Today</strong><small>Your queue, upcoming moments, and completed actions.</small></span></Link><Link className="settings-hub-card desktop-only" href="/templates"><span className="settings-hub-icon">→</span><span><strong>Mix Templates</strong><small>Start from a reviewed follow-up plan.</small></span></Link>{destinations.map(([href, title, description], index) => <div className="more-destination" key={href}><span className="more-section-label">{index < 2 ? "Workspace" : index < 5 ? "Account" : "Support"}</span><Link className="settings-hub-card" href={href}><span className="settings-hub-icon desktop-only">→</span><span><strong>{title}</strong><small>{description}</small></span><span className="settings-row-chevron mobile-only" aria-hidden="true">›</span></Link></div>)}<Link className="settings-hub-card" href="/account/security/mfa"><span className="settings-hub-icon desktop-only">→</span><span><strong>Multi-factor authentication</strong><small>Protect new sign-ins with an authenticator and recovery codes.</small></span><span className="settings-row-chevron mobile-only" aria-hidden="true">›</span></Link><Link className="settings-hub-card" href="/account/security/email"><span className="settings-hub-icon desktop-only">→</span><span><strong>Account email</strong><small>Change and reverify the sign-in email securely.</small></span><span className="settings-row-chevron mobile-only" aria-hidden="true">›</span></Link>{["OWNER", "ADMIN"].includes(membership.role) && <a className="settings-hub-card" href="/api/workspace/export"><span className="settings-hub-icon desktop-only">↓</span><span><strong>Export workspace data</strong><small>Download the complete workspace record without secrets.</small></span><span className="settings-row-chevron mobile-only" aria-hidden="true">›</span></a>}<Link className="settings-hub-card" href="/account?section=referrals"><span className="settings-hub-icon desktop-only">→</span><span><strong>Referrals</strong><small>Share Jump in the Mix and review rewards.</small></span><span className="settings-row-chevron mobile-only" aria-hidden="true">›</span></Link>{session.authUser.isPlatformAdmin && <Link className="settings-hub-card" href="/admin"><span className="settings-hub-icon desktop-only">→</span><span><strong>Admin</strong><small>Platform operations and support controls.</small></span><span className="settings-row-chevron mobile-only" aria-hidden="true">›</span></Link>}</div><form action={logoutAction} className="more-sign-out"><button className="button" type="submit">Sign out</button></form></div>;
}
