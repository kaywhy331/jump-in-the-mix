import type { JumpStatus, Prisma, WorkspaceProfile } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  addLogicalDays,
  addUtcDays,
  createJumpUniquenessKey,
  getJumpDateOccurrences,
  logicalDateFromDate,
  logicalDateKey,
  scheduledLocalDateTimeKey,
  zonedDateTimeToUtc,
  type LogicalDate
} from "@/lib/jump-schedule";

const PENDING_STATUSES: JumpStatus[] = ["PENDING", "COPIED"];
const MUTABLE_STATUSES: JumpStatus[] = ["PENDING", "COPIED", "CANCELED"];
const BATCH_SIZE = 500;

type ReconciliationFilters = {
  workspaceId?: string;
  contactId?: string;
  mixId?: string;
};

export type JumpReconciliationResult = {
  desired: number;
  created: number;
  updated: number;
  canceled: number;
};

type DesiredJump = {
  uniquenessKey: string;
  workspaceId: string;
  contactId: string;
  jumpDateId: string | null;
  mixId: string;
  mixStepId: string;
  stepVersionId: string;
  scheduledAt: Date;
  reason: string;
  templateSnapshot: Prisma.InputJsonValue;
  renderedSnapshot: Prisma.InputJsonValue;
};

function chunks<T>(values: T[], size = BATCH_SIZE): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function endOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999));
}

function render(template: string | null | undefined, values: Record<string, string>): string | null {
  if (!template) return null;
  return template.replace(/{{[^}]+}}/g, (token) => values[token] ?? "");
}

function ownerNameParts(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

function contactValues(
  contact: {
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    publicNotes: string | null;
    emails: { email: string; isPrimary: boolean }[];
    phones: { phone: string; isPrimary: boolean }[];
    addresses: { street1: string | null; city: string | null; state: string | null; postalCode: string | null; isPrimary: boolean }[];
  },
  profile: WorkspaceProfile | null,
  owner: { name: string; email: string }
): Record<string, string> {
  const email = contact.emails.find((item) => item.isPrimary)?.email ?? contact.emails[0]?.email ?? "";
  const phone = contact.phones.find((item) => item.isPrimary)?.phone ?? contact.phones[0]?.phone ?? "";
  const address = contact.addresses.find((item) => item.isPrimary) ?? contact.addresses[0];
  const formattedAddress = address ? [address.street1, address.city, address.state, address.postalCode].filter(Boolean).join(", ") : "";
  const ownerName = ownerNameParts(owner.name);

  return {
    "{{First Name}}": contact.firstName ?? "there",
    "{{Last Name}}": contact.lastName ?? "",
    "{{Company}}": contact.company ?? "",
    "{{Email}}": email,
    "{{Phone}}": phone,
    "{{Address}}": formattedAddress,
    "{{Public Notes}}": contact.publicNotes ?? "",
    "{{contact.first_name}}": contact.firstName ?? "there",
    "{{contact.last_name}}": contact.lastName ?? "",
    "{{contact.company}}": contact.company ?? "",
    "{{contact.email}}": email,
    "{{contact.phone}}": phone,
    "{{contact.address}}": formattedAddress,
    "{{contact.public_notes}}": contact.publicNotes ?? "",
    "{{My First Name}}": ownerName.firstName,
    "{{My Last Name}}": ownerName.lastName,
    "{{My Email}}": owner.email,
    "{{My Phone}}": profile?.phone ?? "",
    "{{My Company}}": profile?.company ?? "",
    "{{My Website}}": profile?.website ?? "",
    "{{My Address}}": profile?.mailingAddress ?? [profile?.street, profile?.city, profile?.state, profile?.postalCode].filter(Boolean).join(", "),
    "{{My Product 1}}": profile?.product1 ?? "",
    "{{My Product 2}}": profile?.product2 ?? "",
    "{{My Product 3}}": profile?.product3 ?? "",
    "{{My Product 4}}": profile?.product4 ?? "",
    "{{My Product 5}}": profile?.product5 ?? "",
    "{{My Industry}}": profile?.industry ?? "",
    "{{My Custom 1}}": profile?.myCustom1 ?? "",
    "{{My Custom 2}}": profile?.myCustom2 ?? "",
    "{{My Custom 3}}": profile?.myCustom3 ?? "",
    "{{SMS Signature}}": profile?.smsSignature ?? "",
    "{{Email Signature}}": profile?.emailSignature ?? "",
    "{{my.first_name}}": ownerName.firstName,
    "{{my.last_name}}": ownerName.lastName,
    "{{my.email}}": owner.email,
    "{{my.phone}}": profile?.phone ?? "",
    "{{my.company}}": profile?.company ?? "",
    "{{my.website}}": profile?.website ?? "",
    "{{my.address}}": profile?.mailingAddress ?? [profile?.street, profile?.city, profile?.state, profile?.postalCode].filter(Boolean).join(", "),
    "{{my.product_1}}": profile?.product1 ?? "",
    "{{my.product_2}}": profile?.product2 ?? "",
    "{{my.product_3}}": profile?.product3 ?? "",
    "{{my.product_4}}": profile?.product4 ?? "",
    "{{my.product_5}}": profile?.product5 ?? "",
    "{{my.industry}}": profile?.industry ?? "",
    "{{my.custom_1}}": profile?.myCustom1 ?? "",
    "{{my.custom_2}}": profile?.myCustom2 ?? "",
    "{{my.custom_3}}": profile?.myCustom3 ?? "",
    "{{my.sms_signature}}": profile?.smsSignature ?? "",
    "{{my.email_signature}}": profile?.emailSignature ?? ""
  };
}

function triggerForManualAssignment(date: Date): { logicalDate: LogicalDate; occurrenceKey: string } {
  const logicalDate = logicalDateFromDate(date);
  return { logicalDate, occurrenceKey: `manual:${logicalDateKey(logicalDate)}` };
}

export async function reconcileJumps(filters: ReconciliationFilters = {}): Promise<JumpReconciliationResult> {
  const now = new Date();
  const horizonStart = startOfUtcDay(addUtcDays(now, -45));
  const horizonEnd = endOfUtcDay(addUtcDays(now, 60));
  const occurrenceStart = addUtcDays(horizonStart, -60);
  const occurrenceEnd = addUtcDays(horizonEnd, 60);

  const assignments = await prisma.mixAssignment.findMany({
    where: {
      isActive: true,
      ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
      ...(filters.mixId ? { mixId: filters.mixId } : {}),
      ...(filters.contactId
        ? {
            OR: [
              { contactId: filters.contactId },
              { group: { memberships: { some: { contactId: filters.contactId } } } }
            ]
          }
        : {}),
      mix: { status: "ACTIVE" }
    },
    include: {
      workspace: { include: { profile: true, owner: true } },
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

  const desired = new Map<string, DesiredJump>();

  for (const assignment of assignments) {
    const contacts = new Map<string, NonNullable<typeof assignment.contact>>();
    if (assignment.contact && !assignment.contact.archivedAt) contacts.set(assignment.contact.id, assignment.contact);
    for (const membership of assignment.group?.memberships ?? []) {
      if (!membership.contact.archivedAt) contacts.set(membership.contact.id, membership.contact);
    }

    for (const contact of contacts.values()) {
      if (filters.contactId && contact.id !== filters.contactId) continue;

      const triggers: {
        logicalDate: LogicalDate;
        jumpDateId: string | null;
        occurrenceKey: string;
        reason: string;
        timezone: string;
        timeMinutes: number | null;
      }[] = [];

      if (assignment.mix.triggerMode === "DATE_TRIGGERED") {
        for (const jumpDate of contact.jumpDates.filter((item) => item.dateTypeId === assignment.mix.dateTypeId)) {
          for (const occurrence of getJumpDateOccurrences(jumpDate, occurrenceStart, occurrenceEnd)) {
            triggers.push({
              logicalDate: occurrence,
              jumpDateId: jumpDate.id,
              occurrenceKey: `jump-date:${jumpDate.id}:${logicalDateKey(occurrence)}`,
              reason: jumpDate.label || jumpDate.dateType.name,
              timezone: jumpDate.timezone || assignment.workspace.profile?.timezone || "UTC",
              timeMinutes: jumpDate.timeMinutes
            });
          }
        }
      } else {
        const manual = triggerForManualAssignment(assignment.startDate ?? assignment.createdAt);
        triggers.push({
          ...manual,
          jumpDateId: null,
          reason: assignment.mix.name,
          timezone: assignment.workspace.profile?.timezone || "UTC",
          timeMinutes: null
        });
      }

      const values = contactValues(contact, assignment.workspace.profile, assignment.workspace.owner);
      for (const trigger of triggers) {
        for (const mixStep of assignment.mix.steps) {
          const scheduledLogicalDate = addLogicalDays(trigger.logicalDate, mixStep.dayOffset);
          const sendTimeMinutes = mixStep.sendTimeMinutes ?? trigger.timeMinutes ?? 600;
          const scheduledAt = zonedDateTimeToUtc(scheduledLogicalDate, sendTimeMinutes, trigger.timezone);
          if (scheduledAt < horizonStart || scheduledAt > horizonEnd) continue;

          const localDateTime = scheduledLocalDateTimeKey(scheduledLogicalDate, sendTimeMinutes);
          const uniquenessKey = createJumpUniquenessKey({
            workspaceId: assignment.workspaceId,
            contactId: contact.id,
            mixId: assignment.mixId,
            mixStepId: mixStep.id,
            occurrenceKey: trigger.occurrenceKey,
            scheduledLocalDateTime: localDateTime,
            timezone: trigger.timezone
          });

          desired.set(uniquenessKey, {
            uniquenessKey,
            workspaceId: assignment.workspaceId,
            contactId: contact.id,
            jumpDateId: trigger.jumpDateId,
            mixId: assignment.mixId,
            mixStepId: mixStep.id,
            stepVersionId: mixStep.stepVersionId,
            scheduledAt,
            reason: trigger.reason,
            templateSnapshot: {
              subject: mixStep.stepVersion.subject,
              body: mixStep.stepVersion.body,
              script: mixStep.stepVersion.script,
              channel: mixStep.stepVersion.stepTemplate.channel,
              localDateTime,
              timezone: trigger.timezone
            },
            renderedSnapshot: {
              subject: render(mixStep.stepVersion.subject, values),
              body: render(mixStep.stepVersion.body, values),
              script: render(mixStep.stepVersion.script, values)
            }
          });
        }
      }
    }
  }

  const desiredKeys = [...desired.keys()];
  const existingDesired = [] as {
    id: string;
    uniquenessKey: string;
    status: JumpStatus;
  }[];
  for (const keyBatch of chunks(desiredKeys)) {
    existingDesired.push(...await prisma.jump.findMany({
      where: { uniquenessKey: { in: keyBatch } },
      select: { id: true, uniquenessKey: true, status: true }
    }));
  }
  const existingByKey = new Map(existingDesired.map((item) => [item.uniquenessKey, item]));

  let created = 0;
  let updated = 0;
  const writes: Prisma.PrismaPromise<unknown>[] = [];
  for (const desiredJump of desired.values()) {
    const existing = existingByKey.get(desiredJump.uniquenessKey);
    const sharedData = {
      workspaceId: desiredJump.workspaceId,
      contactId: desiredJump.contactId,
      jumpDateId: desiredJump.jumpDateId,
      mixId: desiredJump.mixId,
      mixStepId: desiredJump.mixStepId,
      stepVersionId: desiredJump.stepVersionId,
      scheduledAt: desiredJump.scheduledAt,
      reason: desiredJump.reason,
      templateSnapshot: desiredJump.templateSnapshot,
      renderedSnapshot: desiredJump.renderedSnapshot
    };

    if (!existing) {
      created += 1;
      writes.push(prisma.jump.upsert({
        where: { uniquenessKey: desiredJump.uniquenessKey },
        create: { ...sharedData, uniquenessKey: desiredJump.uniquenessKey, status: "PENDING" },
        update: sharedData
      }));
    } else if (MUTABLE_STATUSES.includes(existing.status)) {
      updated += 1;
      writes.push(prisma.jump.update({
        where: { id: existing.id },
        data: {
          ...sharedData,
          status: existing.status === "CANCELED" ? "PENDING" : existing.status,
          completedAt: null,
          completionMethod: null
        }
      }));
    }
  }
  for (const writeBatch of chunks(writes, 100)) await prisma.$transaction(writeBatch);

  const staleCandidates = await prisma.jump.findMany({
    where: {
      ...(filters.workspaceId ? { workspaceId: filters.workspaceId } : {}),
      ...(filters.contactId ? { contactId: filters.contactId } : {}),
      ...(filters.mixId ? { mixId: filters.mixId } : {}),
      status: { in: PENDING_STATUSES },
      scheduledAt: { gte: horizonStart, lte: horizonEnd }
    },
    select: { id: true, uniquenessKey: true }
  });
  const staleIds = staleCandidates.filter((item) => !desired.has(item.uniquenessKey)).map((item) => item.id);
  for (const idBatch of chunks(staleIds)) {
    await prisma.jump.updateMany({
      where: { id: { in: idBatch }, status: { in: PENDING_STATUSES } },
      data: { status: "CANCELED", completedAt: null, completionMethod: "reconciled" }
    });
  }

  return { desired: desired.size, created, updated, canceled: staleIds.length };
}

export async function generateJumps(filters: ReconciliationFilters = {}): Promise<number> {
  return (await reconcileJumps(filters)).created;
}
