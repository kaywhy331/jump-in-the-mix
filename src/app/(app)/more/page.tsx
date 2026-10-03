import type { Metadata } from "next";
import Link from "next/link";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { AppearanceControl } from "@/components/Appearance";
import { INVITATIONS_PATH, invitationsLeft, invitationsLeftLabel } from "@/lib/invitation-allowance";
import { requireWorkspace } from "@/lib/auth";
import { logoutAction } from "@/lib/auth-actions";
import { ViewOnlySupportNotice } from "@/components/ViewOnlySupportNotice";

export const metadata: Metadata = { title: "More" };

const destinations = [
  ["/journey", "Journey", "See how your Mixes connect and where each person is right now."],
  ["/calendar", "Calendar", "Schedule meetings and protect your time."],
  ["/settings/connections", "Lead connections", "Bring contacts in from forms, messages, and other tools."],
  ["/settings", "Settings", "Business details, saved messages, dates, and personal preferences."],
  ["/account/preferences", "Personal preferences", "Your display name, timezone, follow-up time, quiet hours, and working days."],
  ["/settings/notifications", "Notifications", "Email summaries and reminders on this device."],
  ["/account", "My account", "Profile, password, active sessions, export, and account deletion."],
  ["/help", "Help", "Get help, report a problem, or share an idea."]
] as const;

const icons: AppIconName[] = ["journey", "calendar", "link", "settings", "filter", "bell", "profile", "help"];

export default async function MorePage() {
  const { impersonation, user, workspace } = await requireWorkspace();
  const invitations = impersonation ? null : await invitationsLeft(user.id, workspace.id);
  return <div className="page more-page"><header className="page-header"><div><h1>More</h1><p>Business settings, account controls, and help.</p></div></header>{impersonation && <ViewOnlySupportNotice message="This support session is view-only. End it to return to the support case." />}<div className="settings-hub-grid">{invitations && <Link className="settings-hub-card invite-hub-card" href={INVITATIONS_PATH}><span className="settings-hub-icon"><AppIcon name="gift" /></span><span><strong>Invite people · {invitationsLeftLabel(invitations)}</strong><small>Give someone you know free access to Jump in the Mix.</small></span></Link>}<Link className="settings-hub-card desktop-only" href="/jumps"><span className="settings-hub-icon"><AppIcon name="home" /></span><span><strong>Today</strong><small>Who to contact next and what to say.</small></span></Link><Link className="settings-hub-card desktop-only" href="/templates"><span className="settings-hub-icon"><AppIcon name="mixes" /></span><span><strong>Ready-made Mixes</strong><small>Start with follow-ups written for your business.</small></span></Link>{destinations.map(([href, title, description], index) => <div className={`more-destination${index === 3 || index === 6 ? " more-destination--group-start" : ""}`} key={href}><span className="more-section-label">{title}</span><Link className="settings-hub-card" href={href}><span className="settings-hub-icon"><AppIcon name={icons[index]} /></span><span><strong>{title}</strong><small>{description}</small></span><span className="settings-row-chevron mobile-only" aria-hidden="true"><AppIcon name="chevronRight" /></span></Link></div>)}</div><AppearanceControl compact />{impersonation ? <form action="/api/admin/impersonation/end" method="post" className="more-sign-out"><button className="button" type="submit">End view-only session</button></form> : <form action={logoutAction} className="more-sign-out"><button className="button" type="submit">Sign out</button></form>}</div>;
}
