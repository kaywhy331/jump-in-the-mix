import { NextResponse } from "next/server";
import { strToU8, zipSync } from "fflate";
import { openAccountExport } from "@/lib/account-export-stream";
import { requireWorkspace } from "@/lib/auth";
import { createContactsCsv, createFollowUpsCsv, createTimelineCsv } from "@/lib/contact-export";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const EXPORTS_PER_HOUR = 6;

export async function GET(request: Request) {
  const { user, workspace, impersonation } = await requireWorkspace();
  if (impersonation) return NextResponse.json({ error: "Personal data export is unavailable during a support session." }, { status: 403 });
  const exportLimit = await consumeRateLimit({ scope: "account.export", identifiers: [user.id], limit: EXPORTS_PER_HOUR, windowMs: 60 * 60 * 1000 });
  if (!exportLimit.allowed) {
    const minutes = Math.max(1, Math.ceil(exportLimit.retryAfterSeconds / 60));
    return NextResponse.json(
      { error: `Exports are limited to six per hour. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.` },
      { status: 429, headers: { "Retry-After": String(exportLimit.retryAfterSeconds), "Cache-Control": "no-store" } }
    );
  }
  const workspaceId = workspace.id;
  if (new URL(request.url).searchParams.get("format") === "csv") {
    // The spreadsheet bundle is still built in memory; only the JSON export is streamed.
    const [contacts, activities, jumps] = await Promise.all([
      prisma.contact.findMany({ where: { workspaceId }, include: { relationshipState: true, emails: true, phones: true, addresses: true, jumpDates: { include: { dateType: true } }, customFieldValues: { include: { definition: true } }, groupMemberships: { include: { group: true } } }, orderBy: { createdAt: "asc" } }),
      prisma.contactActivity.findMany({ where: { workspaceId }, orderBy: { occurredAt: "asc" } }),
      prisma.jump.findMany({ where: { workspaceId }, include: { contact: { select: { displayName: true } }, mix: { select: { name: true } }, stepVersion: { include: { stepTemplate: { select: { channel: true } } } } }, orderBy: { scheduledAt: "asc" } })
    ]);
    const exportedAt = new Date();
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
      "README.txt": strToU8("Jump in the Mix spreadsheet export\n\ncontacts.csv contains people and customer-facing contact details.\ntimeline.csv contains notes and recorded outcomes, including entries marked private.\nfollow-ups.csv contains scheduled and completed follow-ups.\n\nThe JSON export also includes relationship preferences, stopped mixes, configuration and other account records. Security credentials and private connection URLs are excluded. Store either export securely.\n")
    }, { level: 6 });
    return new NextResponse(Buffer.from(archive), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="jump-in-the-mix-spreadsheets-${exportedAt.toISOString().slice(0, 10)}.zip"`,
        "Cache-Control": "no-store"
      }
    });
  }
  // The JSON is written while it is read, a page at a time (src/lib/account-export-stream.ts).
  const exportedAt = new Date();
  const body = await openAccountExport({ user, workspaceId, exportedAt });
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="jump-in-the-mix-personal-data-${exportedAt.toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store"
    }
  });
}
