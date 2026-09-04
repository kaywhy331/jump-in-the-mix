import type { Metadata } from "next";
import Link from "next/link";
import { MixEditor } from "@/components/MixEditor";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { mergeGroupActivity } from "@/lib/group-activity";
import { getPlatformStringList } from "@/lib/platform-settings";
import { prisma } from "@/lib/prisma";
import { READY_MADE_PLANS } from "@/lib/vertical-plan-library";
import { timezoneForUser } from "@/lib/display-preferences";

export const metadata: Metadata = { title: "New plan" };

export default async function NewMixPage({ searchParams }: { searchParams: Promise<{ error?: string; custom?: string }> }) {
  const [query, { workspace, user }] = await Promise.all([searchParams, requireWorkspace()]);
  const timezone = await timezoneForUser(user.id);
  if (query.custom !== "1" && !query.error) {
    const businessType = workspace.profile?.industry ?? "Other";
    const recommended = READY_MADE_PLANS.filter((plan) => plan.industry === businessType || plan.industry === "Other").slice(0, 6);
    return <div className="page new-plan-choice"><header className="page-header"><div><h1>New plan</h1><p>Start with a ready-made plan or build a simple one of your own.</p></div></header><section className="card"><div className="card-header"><div><h2>Recommended for {businessType.toLowerCase()}</h2><p>Choose one and decide who it applies to.</p></div><Link className="button" href="/templates">See every ready-made plan</Link></div><div className="mix-template-grid">{recommended.map((plan) => <article className="mix-template-card" key={plan.id}><span className="status-pill">{plan.category}</span><h3>{plan.title}</h3><p>{plan.description}</p><div className="plan-step-pills">{plan.steps.map((step) => <span key={`${step.name}-${step.dayOffset}`}>{step.channel === "SMS" ? "Text" : step.channel === "PHONE_CALL" ? "Call" : "Email"} · day {step.dayOffset}</span>)}</div><Link className="button primary" href={`/templates/${plan.id}/use`}>Use this plan</Link></article>)}</div></section><section className="card"><h2>Build your own</h2><p>Choose who, what channel, what message, and how many days later. Advanced settings stay out of the way.</p><Link className="button" href="/mixes/new?custom=1">Build a custom plan</Link></section></div>;
  }
  const [dateTypes, rawGroups, groupStates, jumps, categories, industries, activeContactCount, missingEmailCount, missingPhoneCount] = await Promise.all([
    prisma.dateType.findMany({ where: { isActive: true, OR: [{ workspaceId: workspace.id }, { workspaceId: null, isSystem: true }] }, orderBy: [{ isSystem: "asc" }, { name: "asc" }] }),
    prisma.group.findMany({ where: { workspaceId: workspace.id }, include: { _count: { select: { memberships: true } } }, orderBy: { name: "asc" } }),
    prisma.contactGroupState.findMany({ where: { workspaceId: workspace.id }, select: { groupId: true, isActive: true } }),
    prisma.stepTemplate.findMany({ where: { workspaceId: workspace.id, isActive: true }, include: { versions: { orderBy: { version: "desc" }, take: 1 } }, orderBy: [{ channel: "asc" }, { name: "asc" }] }),
    getPlatformStringList("mix.categories"),
    getPlatformStringList("mix.industries"),
    prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null } }),
    prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null, emails: { none: {} } } }),
    prisma.contact.count({ where: { workspaceId: workspace.id, archivedAt: null, phones: { none: {} } } })
  ]);
  const groups = mergeGroupActivity(rawGroups, groupStates);

  return (
    <div className="page">
      <header className="page-header"><div><h1>Build a custom plan</h1><p>Add the follow-ups you want; advanced controls stay tucked away.</p></div></header>
      {query.error && <Notice type="error">{query.error}</Notice>}
      <MixEditor
        dateTypes={dateTypes.map((item) => ({ id: item.id, name: item.name, isSystem: item.isSystem }))}
        groups={groups.map((item) => ({ id: item.id, name: item.name, color: item.color, isActive: item.isActive, contactCount: item._count.memberships }))}
        jumps={jumps.flatMap((item) => item.versions[0] ? [{ id: item.id, name: item.name, channel: item.channel, subject: item.versions[0].subject, body: item.versions[0].body, script: item.versions[0].script }] : [])}
        categories={categories}
        industries={industries}
        workspaceTimezone={timezone}
        activeContactCount={activeContactCount}
        missingEmailCount={missingEmailCount}
        missingPhoneCount={missingPhoneCount}
      />
    </div>
  );
}
