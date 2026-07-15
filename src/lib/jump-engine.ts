import type { JumpDate, WorkspaceProfile } from "@/generated/prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

function addDays(date: Date, days: number): Date {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function validDate(year: number, month: number, day: number): Date {
  const lastDay = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, Math.min(day, lastDay), 10, 0, 0, 0);
}

function occurrences(jumpDate: JumpDate, start: Date, end: Date): Date[] {
  const result: Date[] = [];
  if (jumpDate.recurrence === "NONE") {
    if (jumpDate.dateValue && jumpDate.dateValue >= start && jumpDate.dateValue <= end) result.push(new Date(jumpDate.dateValue));
    return result;
  }

  const month = jumpDate.month ?? (jumpDate.dateValue ? jumpDate.dateValue.getMonth() + 1 : null);
  const day = jumpDate.day ?? (jumpDate.dateValue ? jumpDate.dateValue.getDate() : null);
  if (!month || !day) return result;

  if (jumpDate.recurrence === "YEARLY") {
    for (let year = start.getFullYear() - 1; year <= end.getFullYear() + 1; year += 1) {
      const date = validDate(year, month, day);
      if (date >= start && date <= end) result.push(date);
    }
    return result;
  }

  const cursor = new Date(start.getFullYear(), start.getMonth() - 1, 1);
  const last = new Date(end.getFullYear(), end.getMonth() + 1, 1);
  while (cursor <= last) {
    const date = validDate(cursor.getFullYear(), cursor.getMonth() + 1, day);
    if (date >= start && date <= end) result.push(date);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return result;
}

function render(template: string | null | undefined, values: Record<string, string>): string | undefined {
  if (!template) return undefined;
  return template.replace(/{{[^}]+}}/g, (token) => values[token] ?? "");
}

function contactValues(contact: {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  emails: { email: string; isPrimary: boolean }[];
  phones: { phone: string; isPrimary: boolean }[];
  addresses: { street1: string | null; city: string | null; state: string | null; postalCode: string | null; isPrimary: boolean }[];
}, profile: WorkspaceProfile | null): Record<string, string> {
  const email = contact.emails.find((item) => item.isPrimary)?.email ?? contact.emails[0]?.email ?? "";
  const phone = contact.phones.find((item) => item.isPrimary)?.phone ?? contact.phones[0]?.phone ?? "";
  const address = contact.addresses.find((item) => item.isPrimary) ?? contact.addresses[0];
  const formattedAddress = address ? [address.street1, address.city, address.state, address.postalCode].filter(Boolean).join(", ") : "";
  return {
    "{{First Name}}": contact.firstName ?? "there",
    "{{Last Name}}": contact.lastName ?? "",
    "{{Company}}": contact.company ?? "your team",
    "{{Email}}": email,
    "{{Phone}}": phone,
    "{{Address}}": formattedAddress,
    "{{My Company}}": profile?.company ?? "",
    "{{My Website}}": profile?.website ?? "",
    "{{My Product 1}}": profile?.product1 ?? "our service",
    "{{My Product 2}}": profile?.product2 ?? "",
    "{{My Product 3}}": profile?.product3 ?? "",
    "{{My Product 4}}": profile?.product4 ?? "",
    "{{My Product 5}}": profile?.product5 ?? "",
    "{{My Industry}}": profile?.industry ?? "your industry",
    "{{SMS Signature}}": profile?.smsSignature ?? "",
    "{{Email Signature}}": profile?.emailSignature ?? ""
  };
}

function uniqueKey(parts: string[]): string {
  return createHash("sha256").update(parts.join(":"), "utf8").digest("hex");
}

export async function generateJumps(filters: { workspaceId?: string; contactId?: string; mixId?: string } = {}): Promise<number> {
  const horizonStart = addDays(new Date(), -45);
  horizonStart.setHours(0, 0, 0, 0);
  const horizonEnd = addDays(new Date(), 60);
  horizonEnd.setHours(23, 59, 59, 999);

  const assignments = await prisma.mixAssignment.findMany({
    where: {
      isActive: true,
      ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
      ...(filters.contactId ? { contactId: filters.contactId } : {}),
      ...(filters.mixId ? { mixId: filters.mixId } : {}),
      mix: { status: "ACTIVE" }
    },
    include: {
      workspace: { include: { profile: true } },
      contact: {
        include: {
          emails: true,
          phones: true,
          addresses: true,
          jumpDates: { include: { dateType: true }, where: { isActive: true } }
        }
      },
      group: {
        include: {
          memberships: {
            include: {
              contact: {
                include: {
                  emails: true,
                  phones: true,
                  addresses: true,
                  jumpDates: { include: { dateType: true }, where: { isActive: true } }
                }
              }
            }
          }
        }
      },
      mix: {
        include: {
          steps: {
            include: { stepVersion: { include: { stepTemplate: true } } },
            orderBy: { sortOrder: "asc" }
          },
          dateType: true
        }
      }
    }
  });

  let created = 0;
  for (const assignment of assignments) {
    const contacts = assignment.contact ? [assignment.contact] : assignment.group?.memberships.map((item) => item.contact) ?? [];
    for (const contact of contacts) {
      const triggers: { date: Date; jumpDateId: string | null; reason: string }[] = [];
      if (assignment.mix.triggerMode === "DATE_TRIGGERED") {
        for (const jumpDate of contact.jumpDates.filter((item) => item.dateTypeId === assignment.mix.dateTypeId)) {
          for (const date of occurrences(jumpDate, addDays(horizonStart, -45), addDays(horizonEnd, 45))) {
            triggers.push({ date, jumpDateId: jumpDate.id, reason: jumpDate.label || jumpDate.dateType.name });
          }
        }
      } else {
        const date = assignment.startDate ?? assignment.createdAt;
        triggers.push({ date, jumpDateId: null, reason: assignment.mix.name });
      }

      const values = contactValues(contact, assignment.workspace.profile);
      for (const trigger of triggers) {
        for (const mixStep of assignment.mix.steps) {
          const scheduledAt = addDays(trigger.date, mixStep.dayOffset);
          const minutes = mixStep.sendTimeMinutes ?? 600;
          scheduledAt.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
          if (scheduledAt < horizonStart || scheduledAt > horizonEnd) continue;

          const key = uniqueKey([assignment.workspaceId, contact.id, trigger.jumpDateId ?? assignment.id, assignment.mixId, mixStep.id, scheduledAt.toISOString()]);
          const rendered = {
            subject: render(mixStep.stepVersion.subject, values),
            body: render(mixStep.stepVersion.body, values),
            script: render(mixStep.stepVersion.script, values)
          };
          const result = await prisma.jump.upsert({
            where: { uniquenessKey: key },
            create: {
              workspaceId: assignment.workspaceId,
              contactId: contact.id,
              jumpDateId: trigger.jumpDateId,
              mixId: assignment.mixId,
              mixStepId: mixStep.id,
              stepVersionId: mixStep.stepVersionId,
              scheduledAt,
              reason: trigger.reason,
              templateSnapshot: { subject: mixStep.stepVersion.subject, body: mixStep.stepVersion.body, script: mixStep.stepVersion.script },
              renderedSnapshot: rendered,
              uniquenessKey: key
            },
            update: { renderedSnapshot: rendered, reason: trigger.reason }
          });
          if (result.createdAt.getTime() === result.updatedAt.getTime()) created += 1;
        }
      }
    }
  }
  return created;
}
