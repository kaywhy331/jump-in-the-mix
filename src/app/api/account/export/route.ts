import { NextResponse } from "next/server";
import { strToU8, zipSync } from "fflate";
import { requireWorkspace } from "@/lib/auth";
import { createContactsCsv, createFollowUpsCsv, createTimelineCsv } from "@/lib/contact-export";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { user, workspace, impersonation } = await requireWorkspace();
  if (impersonation) return NextResponse.json({ error: "Personal data export is unavailable during a support session." }, { status: 403 });
  const workspaceId = workspace.id;
  const [
    profile,
    userPreference,
    schedulingPreference,
    contacts,
    activities,
    groups,
    dateTypes,
    templates,
    mixes,
    jumps,
    imports,
    notificationPreference,
    automationPreference,
    reviewRequests,
    automatedDeliveries,
    authIdentities
  ] = await Promise.all([
    prisma.workspaceProfile.findUnique({ where: { workspaceId } }),
    prisma.userPreference.findUnique({ where: { userId: user.id } }),
    prisma.workspacePreference.findUnique({ where: { workspaceId } }),
    prisma.contact.findMany({ where: { workspaceId }, include: { emails: true, phones: true, addresses: true, jumpDates: { include: { dateType: true } }, customFieldValues: { include: { definition: true } }, groupMemberships: { include: { group: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.contactActivity.findMany({ where: { workspaceId }, orderBy: { occurredAt: "asc" } }),
    prisma.group.findMany({ where: { workspaceId }, include: { memberships: true }, orderBy: { createdAt: "asc" } }),
    prisma.dateType.findMany({ where: { OR: [{ workspaceId }, { workspaceId: null, isSystem: true }] }, orderBy: { createdAt: "asc" } }),
    prisma.stepTemplate.findMany({ where: { workspaceId }, include: { versions: { orderBy: { version: "asc" } } }, orderBy: { createdAt: "asc" } }),
    prisma.mix.findMany({ where: { workspaceId }, include: { steps: true, assignments: true }, orderBy: { createdAt: "asc" } }),
    prisma.jump.findMany({ where: { workspaceId }, include: { contact: { select: { displayName: true } }, mix: { select: { name: true } }, stepVersion: { include: { stepTemplate: { select: { channel: true } } } } }, orderBy: { scheduledAt: "asc" } }),
    prisma.contactImportBatch.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.notificationPreference.findUnique({ where: { workspaceId } }),
    prisma.automationPreference.findUnique({ where: { workspaceId } }),
    prisma.reviewRequest.findMany({ where: { workspaceId }, select: { id: true, contactId: true, status: true, rating: true, feedback: true, openedAt: true, respondedAt: true, reviewClickedAt: true, referralClickedAt: true, expiresAt: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.automatedDelivery.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
    prisma.authIdentity.findMany({ where: { userId: user.id }, select: { provider: true, email: true, createdAt: true, updatedAt: true } })
  ]);
  const exportedAt = new Date();
  if (new URL(request.url).searchParams.get("format") === "csv") {
    const contactNames = new Map(contacts.map((contact) => [contact.id, contact.displayName]));
    const contactsCsv = createContactsCsv(contacts.map((contact) => ({
      firstName: contact.firstName,
      lastName: contact.lastName,
      company: contact.company,
      publicNotes: contact.publicNotes,
      emails: contact.emails,
      phones: contact.phones,
      addresses: contact.addresses,
      groups: contact.groupMemberships.map((membership) => membership.group.name),
      jumpDates: contact.jumpDates.map((date) => ({ type: date.dateType.name, label: date.label, date: date.dateValue?.toISOString().slice(0, 10) ?? null, recurrence: date.recurrence })),
      customFields: contact.customFieldValues.map((field) => ({ key: field.definition.key, name: field.definition.name, value: field.value }))
    })));
    const archive = zipSync({
      "contacts.csv": strToU8(contactsCsv),
      "timeline.csv": strToU8(createTimelineCsv(activities, contactNames)),
      "follow-ups.csv": strToU8(createFollowUpsCsv(jumps)),
      "README.txt": strToU8("Jump in the Mix spreadsheet export\n\ncontacts.csv contains people and customer-facing contact details.\ntimeline.csv contains notes and recorded outcomes, including entries marked private.\nfollow-ups.csv contains scheduled and completed follow-ups.\n\nThe complete JSON export contains every account field. Store either export securely.\n")
    }, { level: 6 });
    return new NextResponse(Buffer.from(archive), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="jump-in-the-mix-spreadsheets-${exportedAt.toISOString().slice(0, 10)}.zip"`,
        "Cache-Control": "no-store"
      }
    });
  }
  const document = {
    format: "jump-in-the-mix-personal-export",
    exportedAt: exportedAt.toISOString(),
    account: { id: user.id, name: user.name, email: user.email, signInMethods: authIdentities, createdAt: user.createdAt, updatedAt: user.updatedAt },
    preferences: { profile, userPreference, schedulingPreference, notificationPreference, automationPreference },
    contacts,
    activities,
    groups,
    dateTypes,
    templates,
    mixes,
    jumps,
    imports,
    reviewRequests,
    automatedDeliveries,
    excludedSecurityMaterial: ["password hashes", "session tokens", "provider credentials", "webhook payloads and secrets"]
  };
  return new NextResponse(JSON.stringify(document, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="jump-in-the-mix-personal-data-${exportedAt.toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store"
    }
  });
}
