import type { Metadata } from "next";
import Link from "next/link";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { requireWorkspace } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

const destinations: Array<{ href: string; title: string; description: string; icon: AppIconName }> = [
  { href: "/account/preferences", title: "Personal preferences", description: "Display name, timezone, follow-up time, quiet hours, and weekends.", icon: "settings" },
  { href: "/settings/jumps", title: "Action Templates", description: "Reusable messages, call scripts, and voicemail notes.", icon: "bolt" },
  { href: "/settings/jump-date-types", title: "Important Date Types", description: "Manage the moments that can start a follow-up plan.", icon: "calendar" },
  { href: "/account?section=security", title: "Password & sessions", description: "Change your password and review active devices.", icon: "security" },
  { href: "/account?section=privacy", title: "Data & privacy", description: "Export your personal data or delete your account.", icon: "privacy" }
];

export default async function SettingsPage() {
  await requireWorkspace();
  return <div className="page"><header className="page-header"><div><h1>Settings</h1><p>Simple controls for your personal follow-up system.</p></div></header><div className="settings-hub-grid">{destinations.map((item) => <Link className="settings-hub-card" href={item.href} key={item.href}><span className="settings-hub-icon"><AppIcon name={item.icon}/></span><span><strong>{item.title}</strong><small>{item.description}</small></span><span className="settings-row-chevron mobile-only" aria-hidden="true">›</span></Link>)}</div></div>;
}
