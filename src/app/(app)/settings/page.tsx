import type { Metadata } from "next";
import Link from "next/link";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { requireWorkspace } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

const destinations: Array<{ href: string; title: string; description: string; icon: AppIconName }> = [
  { href: "/settings/business", title: "My business", description: "Business name, services, contact details, and message signatures.", icon: "edit" },
  { href: "/account/preferences", title: "Personal preferences", description: "Display name, timezone, follow-up time, quiet hours, and weekends.", icon: "settings" },
  { href: "/settings/notifications", title: "Notifications", description: "Morning email, weekly report, and push reminders.", icon: "alert" },
  { href: "/settings/jump-date-types", title: "Date types", description: "Manage the dates that can start a follow-up plan.", icon: "calendar" },
  { href: "/account?section=security", title: "Password & sessions", description: "Change your password and review active devices.", icon: "security" },
  { href: "/account?section=privacy", title: "Data & privacy", description: "Export your personal data or delete your account.", icon: "privacy" }
];

export default async function SettingsPage() {
  await requireWorkspace();
  return <div className="page"><header className="page-header"><div><h1>Settings</h1><p>Set up your business, messages, schedule, and account.</p></div></header><div className="settings-hub-grid">{destinations.map((item) => <Link className="settings-hub-card" href={item.href} key={item.href}><span className="settings-hub-icon"><AppIcon name={item.icon}/></span><span><strong>{item.title}</strong><small>{item.description}</small></span><span className="settings-row-chevron mobile-only" aria-hidden="true">›</span></Link>)}</div></div>;
}
