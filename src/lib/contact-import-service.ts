import type { PlanTier, Prisma } from "@/generated/prisma/client";
import { isValidEmail, normalizeEmail, normalizePhone } from "@/lib/contact-input";
import { contactNameForImport, textSimilarity } from "@/lib/contact-import-report";
import { stableKey } from "@/lib/contact-import-shared";
import type {
  ImportCommitResult,
  ImportContactRecord,
  ImportJumpDate,
  ImportMatch,
  ImportMatchCandidate,
  ImportResolution
} from "@/lib/contact-import-types";
import { prisma } from "@/lib/prisma";

export type ContactImportUsage = {
  activeContacts: number;
  contactLimit: number;
  remainingContacts: number;
};

export type ImportMatchResponse = {
  matches: ImportMatch[];
  usage: ContactImportUsage;
};

export type ImportCommitItem = {
  record: ImportContactRecord;
  resolution: ImportResolution;
};

type MatchContact = {
  id: string;
  displayName: string;
  company: string | null;
  emails: { email: string; normalized: string; isPrimary: boolean }[];
  phones: { phone: string; normalized: string; isPrimary: boolean }[];
};

type ResolvedJumpDate = ImportJumpDate & {
  resolvedDateTypeId: string;
  createdInactiveType: string | null;
};

function clean(value: string | null | undefined, maxLength = 2000): string | null {
  const normalized = (value ?? "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizedText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function primaryEmail(contact: MatchContact): string | null {
  return (contact.emails.find((item) => item.isPrimary) ?? contact.emails[0])?.email ?? null;
}

function primaryPhone(contact: MatchContact): string | null {
  return (contact.phones.find((item) => item.isPrimary) ?? contact.phones[0])?.phone ?? null;
}

function emailLocalPart(value: string): string {
  return normalizeEmail(value).split("@")[0] ?? "";
}

function phoneTail(value: string): string {
  return (normalizePhone(value) ?? "").replace(/\D/g, "").slice(-7);
}

async function loadWorkspaceContacts(workspaceId: string): Promise<MatchContact[]> {
  return prisma.contact.findMany({
    where: { workspaceId, archivedAt: null },
    select: {
      id: true,
      displayName: true,
      company: true,
      emails: { select: { email: true, normalized: true, isPrimary: true } },
      phones: { select: { phone: true, normalized: true, isPrimary: true } }
    },
    orderBy: { displayName: "asc" }
  });
}

export async function contactImportUsage(workspaceId: string, _planTier: PlanTier): Promise<ContactImportUsage> {
  const activeContacts = await prisma.contact.count({ where: { workspaceId, archivedAt: null } });
  return { activeContacts, contactLimit: Number.MAX_SAFE_INTEGER, remainingContacts: Number.MAX_SAFE_INTEGER };
}

function exactReasons(record: ImportContactRecord, contact: MatchContact): string[] {
  const reasons: string[] = [];
  const incomingEmails = new Set(record.emails.map((item) => normalizeEmail(item.value)).filter(Boolean));
  const incomingPhones = new Set(
    record.phones.map((item) => normalizePhone(item.value)).filter((value): value is string => Boolean(value))
  );
  for (const email of contact.emails) {
    if (incomingEmails.has(email.normalized)) reasons.push(`Exact email · ${email.email}`);
  }
  for (const phone of contact.phones) {
    if (incomingPhones.has(phone.normalized)) reasons.push(`Exact phone · ${phone.phone}`);
  }
  return [...new Set(reasons)];
}

function hasPartialMethodOverlap(record: ImportContactRecord, contact: MatchContact): boolean {
  const emailParts = new Set(
    record.emails.map((item) => emailLocalPart(item.value)).filter((value) => value.length >= 4)
  );
  const phoneParts = new Set(
    record.phones.map((item) => phoneTail(item.value)).filter((value) => value.length === 7)
  );
  return contact.emails.some((item) => emailParts.has(emailLocalPart(item.email)))
    || contact.phones.some((item) => phoneParts.has(phoneTail(item.phone)));
}

function fuzzyReasons(record: ImportContactRecord, contact: MatchContact): string[] {
  if (!record.company || !contact.company || !hasPartialMethodOverlap(record, contact)) return [];
  const incomingName = record.displayName || [record.firstName, record.lastName].filter(Boolean).join(" ");
  const nameScore = textSimilarity(incomingName, contact.displayName);
  const companyScore = textSimilarity(record.company, contact.company);
  if (nameScore < 0.92 || companyScore < 0.92) return [];
  return [`Similar name and company · ${Math.round(Math.min(nameScore, companyScore) * 100)}%`];
}

function matchCandidate(
  contact: MatchContact,
  matchReasons: string[],
  confidence: "EXACT" | "FUZZY"
): ImportMatchCandidate {
  return {
    contactId: contact.id,
    displayName: contact.displayName,
    company: contact.company,
    primaryEmail: primaryEmail(contact),
    primaryPhone: primaryPhone(contact),
    matchReasons,
    confidence
  };
}

export async function findImportMatches(
  workspaceId: string,
  planTier: PlanTier,
  records: ImportContactRecord[]
): Promise<ImportMatchResponse> {
  if (records.length > 100) throw new Error("Analyze no more than 100 import rows per request.");
  const [contacts, usage] = await Promise.all([
    loadWorkspaceContacts(workspaceId),
    contactImportUsage(workspaceId, planTier)
  ]);

  const matches: ImportMatch[] = records.map((record) => {
    const exact = contacts
      .map((contact) => ({ contact, reasons: exactReasons(record, contact) }))
      .filter((item) => item.reasons.length > 0)
      .map((item) => matchCandidate(item.contact, item.reasons, "EXACT"));
    if (exact.length === 1) return { rowId: record.rowId, kind: "EXACT", candidates: exact, recommendedAction: "MERGE" };
    if (exact.length > 1) return { rowId: record.rowId, kind: "AMBIGUOUS", candidates: exact, recommendedAction: "SKIP" };

    const fuzzy = contacts
      .map((contact) => ({ contact, reasons: fuzzyReasons(record, contact) }))
      .filter((item) => item.reasons.length > 0)
      .slice(0, 5)
      .map((item) => matchCandidate(item.contact, item.reasons, "FUZZY"));
    if (fuzzy.length) return { rowId: record.rowId, kind: "FUZZY", candidates: fuzzy, recommendedAction: "SKIP" };
    return { rowId: record.rowId, kind: "NONE", candidates: [], recommendedAction: "CREATE" };
  });
  return { matches, usage };
}

function validateCalendarDate(value: string): void {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid Jump Date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
    throw new Error(`Invalid Jump Date: ${value}`);
  }
}

function validateImportRecord(record: ImportContactRecord): void {
  if (!record.rowId || record.rowId.length > 160) throw new Error("The import row identifier is invalid.");
  if (!Number.isInteger(record.sourceRow) || record.sourceRow < 1) throw new Error("The source row number is invalid.");
  if (!record.displayName && !record.firstName && !record.lastName && !record.company && !record.emails.length && !record.phones.length) {
    throw new Error("Add a name, company, email, or phone number.");
  }
  if (record.emails.length > 20 || record.phones.length > 20 || record.addresses.length > 20 || record.jumpDates.length > 30) {
    throw new Error("One import row contains too many repeated values.");
  }

  const emailKeys = record.emails.map((item) => normalizeEmail(item.value));
  if (new Set(emailKeys).size !== emailKeys.length) throw new Error("One import row contains the same email more than once.");
  if (record.emails.filter((item) => item.isPrimary).length > 1) throw new Error("Choose only one primary email per Contact.");
  for (const email of record.emails) if (!isValidEmail(email.value)) throw new Error(`Invalid email address: ${email.value}`);

  const phoneKeys = record.phones.map((item) => normalizePhone(item.value));
  if (phoneKeys.some((value) => !value)) throw new Error("One import row contains an invalid phone number.");
  if (new Set(phoneKeys).size !== phoneKeys.length) throw new Error("One import row contains the same phone more than once.");
  if (record.phones.filter((item) => item.isPrimary).length > 1) throw new Error("Choose only one primary phone per Contact.");
  if (record.addresses.filter((item) => item.isPrimary).length > 1) throw new Error("Choose only one primary address per Contact.");

  for (const jumpDate of record.jumpDates) {
    if (!jumpDate.dateTypeId && !jumpDate.dateTypeName?.trim()) throw new Error("Every imported Jump Date needs a type.");
    if (jumpDate.recurrence === "NONE" && !jumpDate.dateValue) throw new Error("A one-time Jump Date needs a full date.");
    if (jumpDate.dateValue) validateCalendarDate(jumpDate.dateValue);
    if (jumpDate.recurrence !== "NONE" && (!jumpDate.month || !jumpDate.day)) {
      throw new Error("A repeating Jump Date needs a month and day.");
    }
  }
}

async function validateWorkspaceReferences(workspaceId: string, record: ImportContactRecord): Promise<void> {
  const groupIds = [...new Set(record.groupIds)];
  const customFieldIds = [...new Set(record.customFields.map((item) => item.definitionId))];
  const [groups, customFields] = await Promise.all([
    groupIds.length
      ? prisma.group.findMany({ where: { workspaceId, id: { in: groupIds } }, select: { id: true } })
      : [],
    customFieldIds.length
      ? prisma.contactCustomFieldDefinition.findMany({ where: { workspaceId, id: { in: customFieldIds } }, select: { id: true } })
      : []
  ]);
  if (groups.length !== groupIds.length) throw new Error("One or more selected Contact Groups are unavailable.");
  if (customFields.length !== customFieldIds.length) throw new Error("One or more mapped custom fields are unavailable.");
}

async function assertNoMethodConflict(
  workspaceId: string,
  record: ImportContactRecord,
  targetContactId?: string
): Promise<void> {
  const emailKeys = [...new Set(record.emails.map((item) => normalizeEmail(item.value)).filter(Boolean))];
  const phoneKeys = [...new Set(
    record.phones.map((item) => normalizePhone(item.value)).filter((value): value is string => Boolean(value))
  )];
  if (!emailKeys.length && !phoneKeys.length) return;

  const or: Prisma.ContactWhereInput[] = [];
  if (emailKeys.length) or.push({ emails: { some: { normalized: { in: emailKeys } } } });
  if (phoneKeys.length) or.push({ phones: { some: { normalized: { in: phoneKeys } } } });
  const conflicts = await prisma.contact.findMany({
    where: {
      workspaceId,
      archivedAt: null,
      ...(targetContactId ? { id: { not: targetContactId } } : {}),
      OR: or
    },
    select: { displayName: true },
    take: 3
  });
  if (conflicts.length) {
    throw new Error(`Contact information already belongs to ${conflicts.map((item) => item.displayName).join(", ")}. Review the duplicate choice.`);
  }
}

function dateAtNoonUtc(value: string | null): Date | null {
  return value ? new Date(`${value}T12:00:00.000Z`) : null;
}

function appendImportedNotes(existing: string | null, incoming: string | null, source: string): string | null {
  const next = clean(incoming, 10_000);
  if (!next) return existing;
  if (!existing) return next;
  if (existing.includes(next)) return existing;
  const date = new Date().toISOString().slice(0, 10);
  return `${existing.trim()}\n\n[Imported ${source} ${date}]\n${next}`.slice(0, 20_000);
}

async function resolveJumpDates(
  workspaceId: string,
  planTier: PlanTier,
  jumpDates: ImportJumpDate[]
): Promise<ResolvedJumpDate[]> {
  const resolved: ResolvedJumpDate[] = [];
  const cache = new Map<string, { id: string; inactiveName: string | null }>();

  for (const jumpDate of jumpDates) {
    if (jumpDate.dateTypeId) {
      const available = await prisma.dateType.findFirst({
        where: { id: jumpDate.dateTypeId, OR: [{ workspaceId }, { workspaceId: null, isSystem: true }] },
        select: { id: true }
      });
      if (!available) throw new Error("A mapped Jump Date Type is no longer available.");
      resolved.push({ ...jumpDate, resolvedDateTypeId: available.id, createdInactiveType: null });
      continue;
    }

    const name = clean(jumpDate.dateTypeName, 100) ?? "Imported Date";
    const slug = stableKey(name) || "imported-date";
    const cached = cache.get(slug);
    if (cached) {
      resolved.push({ ...jumpDate, resolvedDateTypeId: cached.id, createdInactiveType: cached.inactiveName });
      continue;
    }

    let dateType = await prisma.dateType.findFirst({
      where: { slug, OR: [{ workspaceId }, { workspaceId: null, isSystem: true }] },
      select: { id: true, isActive: true }
    });
    let inactiveName: string | null = null;
    if (!dateType) {
      const isActive = true;
      try {
        dateType = await prisma.dateType.create({
          data: { workspaceId, scopeKey: workspaceId, name, slug, isSystem: false, isActive },
          select: { id: true, isActive: true }
        });
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (code !== "P2002") throw error;
        dateType = await prisma.dateType.findFirstOrThrow({
          where: { scopeKey: workspaceId, slug },
          select: { id: true, isActive: true }
        });
      }
    }
    cache.set(slug, { id: dateType.id, inactiveName });
    resolved.push({ ...jumpDate, resolvedDateTypeId: dateType.id, createdInactiveType: inactiveName });
  }
  return resolved;
}

function jumpDateKey(value: {
  dateTypeId: string;
  label?: string | null;
  dateValue?: Date | string | null;
  month?: number | null;
  day?: number | null;
  recurrence?: string;
}): string {
  const logicalDate = value.dateValue instanceof Date
    ? value.dateValue.toISOString().slice(0, 10)
    : value.dateValue?.slice(0, 10) ?? "";
  return [
    value.dateTypeId,
    normalizedText(value.label),
    logicalDate,
    value.month ?? "",
    value.day ?? "",
    value.recurrence ?? ""
  ].join("|");
}

function importedDateRows(
  resolvedDates: ResolvedJumpDate[],
  workspaceId: string,
  contactId: string,
  timezone: string
): Prisma.JumpDateCreateManyInput[] {
  const unique = new Map<string, Prisma.JumpDateCreateManyInput>();
  for (const item of resolvedDates) {
    const dateValue = dateAtNoonUtc(item.dateValue);
    if (item.recurrence === "NONE" && !dateValue) continue;
    const row: Prisma.JumpDateCreateManyInput = {
      workspaceId,
      contactId,
      dateTypeId: item.resolvedDateTypeId,
      dateValue,
      month: item.month,
      day: item.day,
      recurrence: item.recurrence,
      timezone,
      label: clean(item.label, 160),
      source: "CSV",
      isActive: true
    };
    unique.set(jumpDateKey(row), row);
  }
  return [...unique.values()];
}

async function queueReconciliation(workspaceId: string, contactId: string): Promise<void> {
  await prisma.job.create({ data: { workspaceId, task: "generate-jumps", payload: { contactId } } });
}

async function createImportedContact(input: {
  workspaceId: string;
  actorUserId: string;
  planTier: PlanTier;
  timezone: string;
  record: ImportContactRecord;
}): Promise<{ contactId: string; message: string }> {
  const { workspaceId, actorUserId, planTier, timezone, record } = input;
  await assertNoMethodConflict(workspaceId, record);
  const resolvedDates = await resolveJumpDates(workspaceId, planTier, record.jumpDates);
  const inactiveTypes = [...new Set(
    resolvedDates.map((item) => item.createdInactiveType).filter((value): value is string => Boolean(value))
  )];

  const contact = await prisma.$transaction(async (tx) => {
    const created = await tx.contact.create({
      data: {
        workspaceId,
        firstName: clean(record.firstName, 120),
        lastName: clean(record.lastName, 120),
        displayName: clean(record.displayName, 240) ?? contactNameForImport(record),
        company: clean(record.company, 240),
        publicNotes: clean(record.publicNotes, 20_000),
        source: "CSV",
        emails: record.emails.length ? {
          create: record.emails.map((item, index) => ({
            email: item.value.trim(),
            normalized: normalizeEmail(item.value),
            label: clean(item.label, 80),
            isPrimary: index === 0
          }))
        } : undefined,
        phones: record.phones.length ? {
          create: record.phones.map((item, index) => ({
            phone: item.value.trim(),
            normalized: normalizePhone(item.value)!,
            label: clean(item.label, 80),
            isPrimary: index === 0
          }))
        } : undefined,
        addresses: record.addresses.length ? {
          create: record.addresses.map((item, index) => ({ ...item, isPrimary: index === 0 }))
        } : undefined,
        groupMemberships: record.groupIds.length ? {
          create: [...new Set(record.groupIds)].map((groupId) => ({ groupId }))
        } : undefined,
        customFieldValues: record.customFields.length ? {
          create: record.customFields.map((item) => ({ definitionId: item.definitionId, value: item.value.slice(0, 2000) }))
        } : undefined
      }
    });
    const dates = importedDateRows(resolvedDates, workspaceId, created.id, timezone);
    if (dates.length) await tx.jumpDate.createMany({ data: dates });
    await tx.auditLog.create({
      data: {
        workspaceId,
        actorType: "USER",
        actorUserId,
        action: "contact.import.create",
        entityType: "Contact",
        entityId: created.id,
        source: "contacts.import",
        metadata: { format: record.source, sourceRow: record.sourceRow, dateCount: dates.length }
      }
    });
    return created;
  });
  await queueReconciliation(workspaceId, contact.id);
  return {
    contactId: contact.id,
    message: inactiveTypes.length
      ? `Created. ${inactiveTypes.join(", ")} was preserved as an inactive custom Important Date Type.`
      : "Contact created."
  };
}

async function mergeImportedContact(input: {
  workspaceId: string;
  actorUserId: string;
  planTier: PlanTier;
  timezone: string;
  record: ImportContactRecord;
  contactId: string;
  preferImported: boolean;
}): Promise<{ contactId: string; message: string }> {
  const { workspaceId, actorUserId, planTier, timezone, record, contactId, preferImported } = input;
  await assertNoMethodConflict(workspaceId, record, contactId);
  const existing = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId, archivedAt: null },
    include: {
      emails: true,
      phones: true,
      addresses: true,
      groupMemberships: true,
      customFieldValues: true,
      jumpDates: true
    }
  });
  if (!existing) throw new Error("The selected existing Contact is no longer available.");

  const resolvedDates = await resolveJumpDates(workspaceId, planTier, record.jumpDates);
  const inactiveTypes = [...new Set(
    resolvedDates.map((item) => item.createdInactiveType).filter((value): value is string => Boolean(value))
  )];

  await prisma.$transaction(async (tx) => {
    const firstName = preferImported ? clean(record.firstName, 120) ?? existing.firstName : existing.firstName ?? clean(record.firstName, 120);
    const lastName = preferImported ? clean(record.lastName, 120) ?? existing.lastName : existing.lastName ?? clean(record.lastName, 120);
    const company = preferImported ? clean(record.company, 240) ?? existing.company : existing.company ?? clean(record.company, 240);
    const proposedName = clean(record.displayName, 240) ?? ([firstName, lastName].filter(Boolean).join(" ") || company);
    const displayName = preferImported
      ? proposedName || existing.displayName
      : existing.displayName || proposedName || contactNameForImport(record);
    await tx.contact.update({
      where: { id: existing.id },
      data: {
        firstName,
        lastName,
        company,
        displayName,
        publicNotes: appendImportedNotes(existing.publicNotes, record.publicNotes, record.source)
      }
    });

    const emailByKey = new Map(existing.emails.map((item) => [item.normalized, item]));
    const existingHasPrimaryEmail = existing.emails.some((item) => item.isPrimary);
    if (preferImported && record.emails.length) {
      await tx.contactEmail.updateMany({ where: { contactId }, data: { isPrimary: false } });
    }
    for (let index = 0; index < record.emails.length; index += 1) {
      const item = record.emails[index];
      const normalized = normalizeEmail(item.value);
      const found = emailByKey.get(normalized);
      const shouldBePrimary = preferImported ? index === 0 : !existingHasPrimaryEmail && index === 0;
      if (found) {
        if (preferImported || shouldBePrimary) {
          await tx.contactEmail.update({
            where: { id: found.id },
            data: {
              ...(preferImported ? { email: item.value.trim(), label: clean(item.label, 80) } : {}),
              ...(shouldBePrimary ? { isPrimary: true } : {})
            }
          });
        }
      } else {
        await tx.contactEmail.create({
          data: { contactId, email: item.value.trim(), normalized, label: clean(item.label, 80), isPrimary: shouldBePrimary }
        });
      }
    }

    const phoneByKey = new Map(existing.phones.map((item) => [item.normalized, item]));
    const existingHasPrimaryPhone = existing.phones.some((item) => item.isPrimary);
    if (preferImported && record.phones.length) {
      await tx.contactPhone.updateMany({ where: { contactId }, data: { isPrimary: false } });
    }
    for (let index = 0; index < record.phones.length; index += 1) {
      const item = record.phones[index];
      const normalized = normalizePhone(item.value)!;
      const found = phoneByKey.get(normalized);
      const shouldBePrimary = preferImported ? index === 0 : !existingHasPrimaryPhone && index === 0;
      if (found) {
        if (preferImported || shouldBePrimary) {
          await tx.contactPhone.update({
            where: { id: found.id },
            data: {
              ...(preferImported ? { phone: item.value.trim(), label: clean(item.label, 80) } : {}),
              ...(shouldBePrimary ? { isPrimary: true } : {})
            }
          });
        }
      } else {
        await tx.contactPhone.create({
          data: { contactId, phone: item.value.trim(), normalized, label: clean(item.label, 80), isPrimary: shouldBePrimary }
        });
      }
    }

    const addressKey = (address: {
      street1: string | null;
      street2: string | null;
      city: string | null;
      state: string | null;
      postalCode: string | null;
      country: string | null;
    }) => [address.street1, address.street2, address.city, address.state, address.postalCode, address.country]
      .map(normalizedText)
      .join("|");
    const addressByKey = new Map(existing.addresses.map((item) => [addressKey(item), item]));
    const existingHasPrimaryAddress = existing.addresses.some((item) => item.isPrimary);
    if (preferImported && record.addresses.length) {
      await tx.contactAddress.updateMany({ where: { contactId }, data: { isPrimary: false } });
    }
    for (let index = 0; index < record.addresses.length; index += 1) {
      const item = record.addresses[index];
      const found = addressByKey.get(addressKey(item));
      const shouldBePrimary = preferImported ? index === 0 : !existingHasPrimaryAddress && index === 0;
      if (found) {
        if (shouldBePrimary) await tx.contactAddress.update({ where: { id: found.id }, data: { isPrimary: true } });
      } else {
        await tx.contactAddress.create({ data: { contactId, ...item, isPrimary: shouldBePrimary } });
      }
    }

    const newGroupIds = [...new Set(record.groupIds)].filter(
      (groupId) => !existing.groupMemberships.some((item) => item.groupId === groupId)
    );
    if (newGroupIds.length) {
      await tx.contactGroupMembership.createMany({ data: newGroupIds.map((groupId) => ({ contactId, groupId })) });
    }

    const customByDefinition = new Map(existing.customFieldValues.map((item) => [item.definitionId, item]));
    for (const item of record.customFields) {
      const found = customByDefinition.get(item.definitionId);
      if (!found) {
        await tx.contactCustomFieldValue.create({
          data: { contactId, definitionId: item.definitionId, value: item.value.slice(0, 2000) }
        });
      } else if (preferImported || !found.value.trim()) {
        await tx.contactCustomFieldValue.update({
          where: { id: found.id },
          data: { value: item.value.slice(0, 2000) }
        });
      }
    }

    const existingDateKeys = new Set(existing.jumpDates.map((item) => jumpDateKey(item)));
    const dates = importedDateRows(resolvedDates, workspaceId, contactId, timezone)
      .filter((item) => !existingDateKeys.has(jumpDateKey(item)));
    if (dates.length) await tx.jumpDate.createMany({ data: dates });

    await tx.auditLog.create({
      data: {
        workspaceId,
        actorType: "USER",
        actorUserId,
        action: preferImported ? "contact.import.prefer-imported" : "contact.import.merge",
        entityType: "Contact",
        entityId: contactId,
        source: "contacts.import",
        metadata: { format: record.source, sourceRow: record.sourceRow, dateCount: dates.length }
      }
    });
  });

  await queueReconciliation(workspaceId, contactId);
  return {
    contactId,
    message: inactiveTypes.length
      ? `${preferImported ? "Updated" : "Merged"}. ${inactiveTypes.join(", ")} was preserved as an inactive custom Important Date Type.`
      : preferImported ? "Contact updated while preserving additional existing values." : "Contact merged."
  };
}

function cachedImportResult(value: Prisma.JsonValue | null): ImportCommitResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.rowId !== "string" || typeof candidate.status !== "string" || typeof candidate.message !== "string") return null;
  return candidate as unknown as ImportCommitResult;
}

async function saveIdempotentResult(workspaceId: string, key: string, result: ImportCommitResult): Promise<void> {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.idempotencyKey.upsert({
    where: { workspaceId_key: { workspaceId, key } },
    create: { workspaceId, key, response: result as unknown as Prisma.InputJsonValue, expiresAt },
    update: { response: result as unknown as Prisma.InputJsonValue, expiresAt }
  });
}

export async function commitContactImportBatch(input: {
  workspaceId: string;
  actorUserId: string;
  planTier: PlanTier;
  timezone: string;
  importId: string;
  items: ImportCommitItem[];
}): Promise<ImportCommitResult[]> {
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(input.importId)) throw new Error("The import identifier is invalid.");
  if (input.items.length > 50) throw new Error("Import no more than 50 rows per request.");
  const results: ImportCommitResult[] = [];

  for (const item of input.items) {
    const { record, resolution } = item;
    const key = `contact-import:${input.importId}:${record.rowId}`;
    const cached = await prisma.idempotencyKey.findUnique({
      where: { workspaceId_key: { workspaceId: input.workspaceId, key } },
      select: { response: true }
    });
    const cachedResult = cachedImportResult(cached?.response ?? null);
    if (cachedResult) {
      results.push(cachedResult);
      continue;
    }

    try {
      validateImportRecord(record);
      await validateWorkspaceReferences(input.workspaceId, record);
      if (resolution.rowId !== record.rowId) throw new Error("The duplicate resolution does not match this import row.");

      let status: ImportCommitResult["status"] = "SKIPPED";
      let outcome: { contactId: string; message: string };
      if (resolution.action === "SKIP") {
        outcome = { contactId: resolution.targetContactId ?? "", message: "Skipped by user." };
      } else if (resolution.action === "CREATE") {
        outcome = await createImportedContact({
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          planTier: input.planTier,
          timezone: input.timezone,
          record
        });
        status = "CREATED";
      } else {
        if (!resolution.targetContactId) throw new Error("Choose the existing Contact to update.");
        outcome = await mergeImportedContact({
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          planTier: input.planTier,
          timezone: input.timezone,
          record,
          contactId: resolution.targetContactId,
          preferImported: resolution.action === "REPLACE"
        });
        status = resolution.action === "REPLACE" ? "REPLACED" : "MERGED";
      }

      const result: ImportCommitResult = {
        rowId: record.rowId,
        sourceRow: record.sourceRow,
        status,
        contactId: outcome.contactId || null,
        message: outcome.message
      };
      await saveIdempotentResult(input.workspaceId, key, result);
      results.push(result);
    } catch (error) {
      results.push({
        rowId: record.rowId,
        sourceRow: record.sourceRow,
        status: "FAILED",
        contactId: null,
        message: error instanceof Error ? error.message : "The Contact could not be imported."
      });
    }
  }
  return results;
}
