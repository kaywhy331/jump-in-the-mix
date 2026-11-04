import type { Metadata } from "next";
import Link from "next/link";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { requireWorkspace } from "@/lib/auth";
import { BackLink } from "@/components/BackLink";
import { ViewOnlySupportNotice } from "@/components/ViewOnlySupportNotice";
import { prisma } from "@/lib/prisma";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { timeOfDayLabel, zoneLabel } from "@/lib/display-labels";
import { initialJourneySetup, readJourneyPreferences } from "@/lib/journey-preferences";
import { newContactPlacementSetting } from "@/lib/new-contact-placement";
import { automaticEmailConfigured, automaticSmsConfigured } from "@/lib/automatic-delivery";

export const metadata: Metadata = { title: "Settings" };

type SettingsGroup = {
  id: string;
  title: string;
  rows: Array<{ href: string; title: string; value: string; icon: AppIconName }>;
};

const countLabel = (count: number, singular: string, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

export default async function SettingsPage() {
  const { workspace, user, impersonation } = await requireWorkspace();
  const [display, scheduling, stages, stageCount, placement, leadCount, calendarCount, notifications, sending, dateCount, sessionCount, contactCount] = await Promise.all([
    displayPreferencesForUser(user.id),
    prisma.workspacePreference.findUnique({ where: { workspaceId: workspace.id } }),
    prisma.journeyPreference.findUnique({ where: { workspaceId: workspace.id }, select: { enabled: true } }),
    prisma.journeyStage.count({ where: { workspaceId: workspace.id, isActive: true } }),
    newContactPlacementSetting(prisma, workspace.id),
    prisma.intakeConnection.count({ where: { workspaceId: workspace.id, enabled: true } }),
    prisma.calendarConnection.count({ where: { workspaceId: workspace.id, enabled: true } }),
    prisma.notificationPreference.findUnique({ where: { workspaceId: workspace.id }, select: { emailDigestEnabled: true, weeklyReportEnabled: true } }),
    prisma.automationPreference.findUnique({ where: { workspaceId: workspace.id }, select: { enabled: true, emailEnabled: true, smsEnabled: true } }),
    prisma.dateType.count({ where: { isActive: true, OR: [{ workspaceId: workspace.id, isSystem: false }, { workspaceId: null, isSystem: true }] } }),
    impersonation ? null : prisma.session.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } }),
    prisma.contact.count({ where: { workspaceId: workspace.id } })
  ]);
  const schedule = initialJourneySetup(scheduling, display.timeZone);
  const automaticChannels = sending?.enabled ? [
    sending.emailEnabled && automaticEmailConfigured() ? "email" : null,
    sending.smsEnabled && automaticSmsConfigured() ? "text" : null
  ].filter(Boolean) : [];
  const privateValue = "Private during support view";
  const groups: SettingsGroup[] = [
    { id: "business", title: "Your business", rows: [
      { href: "/settings/business", title: "My business", value: workspace.profile?.company || "Business name not set", icon: "business" },
      { href: "/calendar", title: "Calendar & time blocks", value: `${countLabel(calendarCount, "calendar connection")} on`, icon: "calendar" },
      { href: readJourneyPreferences(scheduling?.journeyPreferences) ? "/account/preferences#journey-preferences" : "/account/preferences", title: "Working hours and scheduling", value: `Follow-ups at ${timeOfDayLabel(schedule.defaultFollowUpMinutes, display.locale)} · ${zoneLabel(display.timeZone)}`, icon: "calendar" },
      { href: "/settings/sending", title: "Sending to customers", value: automaticChannels.length ? `Automatic ${automaticChannels.join(" and ")} on` : "You review and send", icon: "message" }
    ] },
    { id: "people", title: "People and leads", rows: [
      { href: "/settings/journey", title: "Contact stages", value: stages ? `${countLabel(stageCount, "stage")} · Rules ${stages.enabled ? "on" : "paused"}` : "Not set up", icon: "journey" },
      { href: "/settings/new-contacts", title: "New contacts", value: placement.placement === "ASK" ? "Ask each time" : placement.mix?.name ?? "No Mix", icon: "userPlus" },
      { href: "/settings/connections", title: "Lead connections", value: `${countLabel(leadCount, "connection")} on`, icon: "link" },
      { href: "/settings/jump-date-types", title: "Date types", value: `${countLabel(dateCount, "date type")} available`, icon: "calendar" }
    ] },
    { id: "you", title: "You", rows: [
      { href: "/account/preferences", title: "Personal preferences", value: impersonation ? privateValue : `${user.name} · ${zoneLabel(display.timeZone)}`, icon: "filter" },
      { href: "/settings/notifications", title: "Notifications", value: `Morning email ${notifications?.emailDigestEnabled ? "on" : "off"} · Weekly report ${notifications?.weeklyReportEnabled ? "on" : "off"}`, icon: "bell" }
    ] },
    { id: "account", title: "Account", rows: [
      { href: "/account?section=security", title: "Password & sessions", value: impersonation ? privateValue : countLabel(sessionCount ?? 0, "active session"), icon: "security" },
      { href: "/account?section=privacy", title: "Data & privacy", value: `${countLabel(contactCount, "contact")} saved`, icon: "privacy" }
    ] }
  ];

  return <div className="page settings-page">
    <BackLink href="/more" label="More" phoneOnly />
    <header className="page-header"><div><h1>Settings</h1><p>Set up your business, messages, schedule, and account.</p></div></header>
    {impersonation && <ViewOnlySupportNotice />}
    {groups.map((group) => <section className="settings-hub-group" aria-labelledby={`settings-${group.id}`} key={group.id}>
      <h2 id={`settings-${group.id}`}>{group.title}</h2>
      <div className="settings-hub-grid">{group.rows.map((item) => <Link className="settings-hub-card" href={item.href} key={item.title}>
        <span className="settings-hub-icon"><AppIcon name={item.icon} /></span>
        <span className="settings-hub-copy"><strong>{item.title}</strong><small>{item.value}</small></span>
        <span className="settings-row-chevron" aria-hidden="true"><AppIcon name="chevronRight" /></span>
      </Link>)}</div>
    </section>)}
  </div>;
}
