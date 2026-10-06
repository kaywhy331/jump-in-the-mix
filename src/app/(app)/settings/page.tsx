import type { Metadata } from "next";
import Link from "next/link";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { requireWorkspace } from "@/lib/auth";
import { BackLink } from "@/components/BackLink";
import { ViewOnlySupportNotice } from "@/components/ViewOnlySupportNotice";

export const metadata: Metadata = { title: "Settings" };

const destinations: Array<{ href: string; title: string; description: string; icon: AppIconName }> = [
  { href: "/settings/journey", title: "Contact stages", description: "Optional labels such as Lead or Client, the events that move people between them, and the Mix each stage can start.", icon: "journey" },
  { href: "/settings/new-contacts", title: "New contacts", description: "Where people go when you add them: a Mix you choose, a question each time, or No Mix.", icon: "userPlus" },
  { href: "/settings/connections", title: "Lead connections", description: "Forms and connections that bring people into your business.", icon: "link" },
  { href: "/calendar", title: "Calendar & time blocks", description: "Meetings, availability, and calendar connections.", icon: "calendar" },
  { href: "/settings/business", title: "My business", description: "Business name, services, contact details, and message signatures.", icon: "business" },
  { href: "/account/preferences", title: "Personal preferences", description: "Display name, timezone, follow-up time, quiet hours, and working days.", icon: "filter" },
  { href: "/settings/notifications", title: "Notifications", description: "Morning email, weekly report, and push reminders.", icon: "bell" },
  { href: "/settings/sending", title: "Sending to customers", description: "How your prepared messages reach people.", icon: "message" },
  { href: "/settings/jump-date-types", title: "Date types", description: "Manage the dates that can start a follow-up Mix.", icon: "calendar" },
  { href: "/account?section=security", title: "Password & sessions", description: "Change your password and review active devices.", icon: "security" },
  { href: "/account?section=privacy", title: "Data & privacy", description: "Export your personal data or delete your account.", icon: "privacy" }
];

export default async function SettingsPage() {
  const { impersonation } = await requireWorkspace();
  return <div className="page settings-page"><BackLink href="/more" label="More" phoneOnly /><header className="page-header"><div><h1>Settings</h1><p>Set up your business, messages, schedule, and account.</p></div></header>{impersonation && <ViewOnlySupportNotice />}<div className="settings-hub-grid">{destinations.map((item) => <Link className="settings-hub-card" href={item.href} key={item.href}><span className="settings-hub-icon"><AppIcon name={item.icon}/></span><span><strong>{item.title}</strong><small>{item.description}</small></span><span className="settings-row-chevron mobile-only" aria-hidden="true"><AppIcon name="chevronRight" /></span></Link>)}</div></div>;
}
