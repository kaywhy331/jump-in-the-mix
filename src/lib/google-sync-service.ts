import type { IntegrationConnection, PlanTier, Prisma } from "@/generated/prisma/client";
import { isValidEmail, normalizeEmail, normalizePhone } from "@/lib/contact-input";
import { normalizedImportText, stableKey } from "@/lib/contact-import-shared";
import { textSimilarity } from "@/lib/contact-import-report";
import { env } from "@/lib/env";
import {
  googlePersonInSelectedGroups,
  googlePersonToContactRecord,
  listGoogleConnections,
  readGoogleConnectionMetadata,
  type GoogleConnectionMetadata,
  type GoogleContactRecord
} from "@/lib/google-contacts";
import { PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

const ACTIVE_RUN_STATUSES = ["QUEUED", "RUNNING"];
const GOOGLE_SYNC_TASK = "sync-google-contacts";

type LocalContact = {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  publicNotes: string | null;
  archivedAt: Date | null;
  emails: Array<{ id: string; email: string; normalized: string; label: string | null; isPrimary: boolean }>;
  phones: Array<{ id: string; phone: string; normalized: string; label: string | null; isPrimary: boolean }>;
  addresses: Array<{
    id: string;
    label: string | null;
    street1: string | null;
    street2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    isPrimary: boolean;
  }>;
  jumpDates: Array<{
    id: string;
    dateTypeId: string;
    label: string | null;
    dateValue: Date | null;
    month: number | null;
    day: number | null;
    recurrence: string;
  }>;
};

type GoogleDecisionKind = "CREATE" | "MERGE" | "LINKED" | "REVIEW" | "DELETED" | "SKIP";

type GoogleDecision = {
  record: GoogleContactRecord;
  kind: GoogleDecisionKind;
  targetContactId: string | null;
  candidateIds: string[];
  reasons: string[];
};

export type GooglePreviewItem = {
  rowId: string;
  externalId: string;
  displayName: string;
  company: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  decision: GoogleDecisionKind;
  reasons: string[];
  candidates: Array<{ contactId: string; displayName: string; company: string | null }>;
};

export type GooglePreviewResult = {
  totalGoogleContacts: number;
  selectedContacts: number;
  createCount: number;
  updateCount: number;
  reviewCount: number;
  deletedCount: number;
  remainingContactCapacity: number;
  exceedsPlanBy: number;
  sample: GooglePreviewItem[];
};

export type GoogleSyncConfig = {
  selectedGroupResourceNames: string[];
  selectedGroupLabels: Record<string, string>;
  autoMergeExact: boolean;
};

export type GoogleSyncResult = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  nextSyncToken: string | null;
  fullSync: boolean;
};

function clean(value: string | null | undefined, maxLength = 2000): string | null {
  const next = (value ?? "").trim();
  return next ? next.slice(0, maxLength) : null;
}

function primaryEmail(record: GoogleContactRecord): string | null {
  return (record.emails.find((item) => item.isPrimary) ?? record.emails[0])?.value ?? null;
}

function primaryPhone(record: GoogleContactRecord): string | null {
  return (record.phones.find((item) => item.isPrimary) ?? record.phones[0])?.value ?? null;
}

function emailLocalPart(value: string): string {
  return normalizeEmail(value).split("@")[0] ?? "";
}

function phoneTail(value: string): string {
  return (normalizePhone(value) ?? "").replace(/\D/g, "").slice(-7);
}

function appendGoogleNotes(existing: string | null, incoming: string | null): string | null {
  const next = clean(incoming, 10_000);
  if (!next) return existing;
  if (!existing) return next;
  if (existing.includes(next)) return existing;
  const date = new Date().toISOString().slice(0, 10);
  return `${existing.trim()}\n\n[Synced from Google ${date}]\n${next}`.slice(0, 20_000);
}

function addressKey(value: {
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
}): string {
  return [value.street1, value.street2, value.city, value.state, value.postalCode, value.country]
    .map((item) => normalizedImportText(item ?? ""))
    .join("|");
}

function jumpDateKey(value: {
  dateTypeId: string;
  label: string | null;
  dateValue: Date | null;
  month: number | null;
  day: number | null;
  recurrence: string;
}): string {
  return [
    value.dateTypeId,
    normalizedImportText(value.label ?? ""),
    value.dateValue?.toISOString().slice(0, 10) ?? "",
    value.month ?? "",
    value.day ?? "",
    value.recurrence
  ].join("|");
}

function googleDateAtNoon(value: string | null): Date | null {
  return value ? new Date(`${value}T12:00:00.000Z`) : null;
}

function sameStringSet(left: string[], right: string[]): boolean {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function normalizeConfig(input: Partial<GoogleSyncConfig>): GoogleSyncConfig {
  const names = [...new Set((input.selectedGroupResourceNames ?? []).map((item) => item.trim()).filter(Boolean))].slice(0, 1000);
  const labels = Object.fromEntries(
    Object.entries(input.selectedGroupLabels ?? {})
      .filter(([key, value]) => names.includes(key) && typeof value === "string")
      .map(([key, value]) => [key, value.trim().slice(0, 160)])
  );
  return {
    selectedGroupResourceNames: names,
    selectedGroupLabels: labels,
    autoMergeExact: input.autoMergeExact !== false
  };
}

function configFromConnection(connection: Pick<IntegrationConnection, "metadata">): GoogleSyncConfig {
  const metadata = readGoogleConnectionMetadata(connection.metadata);
  return normalizeConfig({
    selectedGroupResourceNames: metadata.selectedGroupResourceNames,
    selectedGroupLabels: metadata.selectedGroupLabels,
    autoMergeExact: metadata.autoMergeExact
  });
}

async function loadLocalContacts(workspaceId: string): Promise<LocalContact[]> {
  return prisma.contact.findMany({
    where: { workspaceId, archivedAt: null },
    select: {
      id: true,
      displayName: true,
      firstName: true,
      lastName: true,
      company: true,
      publicNotes: true,
      archivedAt: true,
      emails: true,
      phones: true,
      addresses: true,
      jumpDates: {
        select: {
          id: true,
          dateTypeId: true,
          label: true,
          dateValue: true,
          month: true,
          day: true,
          recurrence: true
        }
      }
    },
    orderBy: { displayName: "asc" }
  });
}

function methodOverlap(record: GoogleContactRecord, contact: LocalContact): boolean {
  const emailParts = new Set(record.emails.map((item) => emailLocalPart(item.value)).filter((value) => value.length >= 4));
  const phoneParts = new Set(record.phones.map((item) => phoneTail(item.value)).filter((value) => value.length === 7));
  return contact.emails.some((item) => emailParts.has(emailLocalPart(item.email)))
    || contact.phones.some((item) => phoneParts.has(phoneTail(item.phone)));
}

function buildDecisions(input: {
  records: GoogleContactRecord[];
  contacts: LocalContact[];
  links: Array<{ externalId: string; contactId: string; deletedAt: Date | null }>;
  autoMergeExact: boolean;
}): GoogleDecision[] {
  const contactsById = new Map(input.contacts.map((contact) => [contact.id, contact]));
  const linksByExternalId = new Map(input.links.map((link) => [link.externalId, link]));
  const emailIndex = new Map<string, Set<string>>();
  const phoneIndex = new Map<string, Set<string>>();
  for (const contact of input.contacts) {
    for (const email of contact.emails) {
      const ids = emailIndex.get(email.normalized) ?? new Set<string>();
      ids.add(contact.id);
      emailIndex.set(email.normalized, ids);
    }
    for (const phone of contact.phones) {
      const ids = phoneIndex.get(phone.normalized) ?? new Set<string>();
      ids.add(contact.id);
      phoneIndex.set(phone.normalized, ids);
    }
  }

  return input.records.map((record) => {
    const link = linksByExternalId.get(record.externalId);
    if (record.deleted) {
      return {
        record,
        kind: link ? "DELETED" : "SKIP",
        targetContactId: link?.contactId ?? null,
        candidateIds: link ? [link.contactId] : [],
        reasons: [link ? "Deleted from Google; the local Contact will be preserved." : "Deleted Google record has no local link."]
      };
    }
    if (link) {
      const linkedContact = contactsById.get(link.contactId);
      return {
        record,
        kind: linkedContact ? "LINKED" : "REVIEW",
        targetContactId: linkedContact?.id ?? null,
        candidateIds: linkedContact ? [linkedContact.id] : [],
        reasons: [linkedContact ? "Previously linked Google Contact." : "The previously linked local Contact is unavailable or archived."]
      };
    }

    const exactIds = new Set<string>();
    for (const email of record.emails) {
      for (const id of emailIndex.get(normalizeEmail(email.value)) ?? []) exactIds.add(id);
    }
    for (const phone of record.phones) {
      const normalized = normalizePhone(phone.value);
      if (!normalized) continue;
      for (const id of phoneIndex.get(normalized) ?? []) exactIds.add(id);
    }
    if (exactIds.size === 1) {
      const targetContactId = [...exactIds][0];
      return {
        record,
        kind: input.autoMergeExact ? "MERGE" : "REVIEW",
        targetContactId: input.autoMergeExact ? targetContactId : null,
        candidateIds: [targetContactId],
        reasons: [input.autoMergeExact ? "Exact normalized email or phone match." : "Exact match found; automatic merging is disabled."]
      };
    }
    if (exactIds.size > 1) {
      return {
        record,
        kind: "REVIEW",
        targetContactId: null,
        candidateIds: [...exactIds],
        reasons: ["The Google Contact exactly matches more than one local Contact."]
      };
    }

    const fuzzy = input.contacts
      .filter((contact) => {
        if (!record.company || !contact.company || !record.displayName || !methodOverlap(record, contact)) return false;
        return textSimilarity(record.displayName, contact.displayName) >= 0.92
          && textSimilarity(record.company, contact.company) >= 0.92;
      })
      .slice(0, 5)
      .map((contact) => contact.id);
    if (fuzzy.length) {
      return {
        record,
        kind: "REVIEW",
        targetContactId: null,
        candidateIds: fuzzy,
        reasons: ["Similar name and company with supporting contact information. Review required."]
      };
    }
    return { record, kind: "CREATE", targetContactId: null, candidateIds: [], reasons: ["No existing Contact matched."] };
  });
}

async function recordsAndDecisions(input: {
  connection: IntegrationConnection;
  config: GoogleSyncConfig;
  syncToken?: string | null;
  maxPeople?: number;
}) {
  const response = await listGoogleConnections({
    connection: input.connection,
    syncToken: input.syncToken,
    maxPeople: input.maxPeople
  });
  const allRecords = response.people
    .map((person, index) => googlePersonToContactRecord(person, index + 1))
    .filter((record): record is GoogleContactRecord => Boolean(record));
  const externalIds = allRecords.map((record) => record.externalId);
  const links = externalIds.length
    ? await prisma.externalContactLink.findMany({
        where: {
          workspaceId: input.connection.workspaceId,
          provider: "GOOGLE_CONTACTS",
          externalId: { in: externalIds }
        },
        select: { externalId: true, contactId: true, deletedAt: true }
      })
    : [];
  const linkedIds = new Set(links.map((link) => link.externalId));
  const records = allRecords.filter((record) => {
    if (record.deleted) return linkedIds.has(record.externalId);
    const person = response.people[record.sourceRow - 1];
    return person ? googlePersonInSelectedGroups(person, input.config.selectedGroupResourceNames) : false;
  });
  const contacts = await loadLocalContacts(input.connection.workspaceId);
  const decisions = buildDecisions({ records, contacts, links, autoMergeExact: input.config.autoMergeExact });
  return { response, allRecords, records, contacts, decisions };
}

export async function previewGoogleContacts(input: {
  workspaceId: string;
  connectionId: string;
  config: GoogleSyncConfig;
}): Promise<GooglePreviewResult> {
  const connection = await prisma.integrationConnection.findFirst({
    where: { id: input.connectionId, workspaceId: input.workspaceId, provider: "GOOGLE_CONTACTS", status: "ACTIVE" }
  });
  if (!connection) throw new Error("Connect Google Contacts before previewing an import.");
  const config = normalizeConfig(input.config);
  const planned = await recordsAndDecisions({ connection, config });
  const remainingContactCapacity = Math.max(
    PLAN_LIMITS[(await prisma.workspace.findUniqueOrThrow({ where: { id: input.workspaceId }, select: { planTier: true } })).planTier].contacts
      - planned.contacts.length,
    0
  );
  const createCount = planned.decisions.filter((item) => item.kind === "CREATE").length;
  const updateCount = planned.decisions.filter((item) => item.kind === "MERGE" || item.kind === "LINKED").length;
  const reviewCount = planned.decisions.filter((item) => item.kind === "REVIEW").length;
  const deletedCount = planned.decisions.filter((item) => item.kind === "DELETED").length;
  const contactById = new Map(planned.contacts.map((contact) => [contact.id, contact]));
  const sample = [...planned.decisions]
    .sort((left, right) => {
      const priority: Record<GoogleDecisionKind, number> = { REVIEW: 0, CREATE: 1, MERGE: 2, LINKED: 3, DELETED: 4, SKIP: 5 };
      return priority[left.kind] - priority[right.kind];
    })
    .slice(0, 20)
    .map<GooglePreviewItem>((decision) => ({
      rowId: decision.record.rowId,
      externalId: decision.record.externalId,
      displayName: decision.record.displayName ?? "Deleted Google Contact",
      company: decision.record.company,
      primaryEmail: primaryEmail(decision.record),
      primaryPhone: primaryPhone(decision.record),
      decision: decision.kind,
      reasons: decision.reasons,
      candidates: decision.candidateIds
        .map((id) => contactById.get(id))
        .filter((contact): contact is LocalContact => Boolean(contact))
        .map((contact) => ({ contactId: contact.id, displayName: contact.displayName, company: contact.company }))
    }));
  return {
    totalGoogleContacts: planned.allRecords.filter((record) => !record.deleted).length,
    selectedContacts: planned.records.filter((record) => !record.deleted).length,
    createCount,
    updateCount,
    reviewCount,
    deletedCount,
    remainingContactCapacity,
    exceedsPlanBy: Math.max(createCount - remainingContactCapacity, 0),
    sample
  };
}

async function resolveDateTypeIds(workspaceId: string, planTier: PlanTier, names: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  let activeCustomCount = await prisma.dateType.count({ where: { workspaceId, isSystem: false, isActive: true } });
  const limit = PLAN_LIMITS[planTier].customDateTypes;
  for (const name of [...new Set(names)]) {
    const key = stableKey(name) || "imported-date";
    let dateType = await prisma.dateType.findFirst({
      where: {
        OR: [
          { workspaceId, slug: key },
          { workspaceId, name: { equals: name, mode: "insensitive" } },
          { workspaceId: null, isSystem: true, slug: key },
          { workspaceId: null, isSystem: true, name: { equals: name, mode: "insensitive" } }
        ]
      },
      select: { id: true, isActive: true }
    });
    if (!dateType) {
      const isActive = activeCustomCount < limit;
      try {
        dateType = await prisma.dateType.create({
          data: { workspaceId, scopeKey: workspaceId, name, slug: key, isSystem: false, isActive },
          select: { id: true, isActive: true }
        });
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
        if (code !== "P2002") throw error;
        dateType = await prisma.dateType.findFirstOrThrow({
          where: { scopeKey: workspaceId, slug: key },
          select: { id: true, isActive: true }
        });
      }
      if (dateType.isActive) activeCustomCount += 1;
    }
    result.set(name, dateType.id);
  }
  return result;
}

function incomingDateRows(input: {
  record: GoogleContactRecord;
  workspaceId: string;
  contactId: string;
  timezone: string;
  dateTypeIds: Map<string, string>;
}): Prisma.JumpDateCreateManyInput[] {
  return input.record.jumpDates.flatMap((item) => {
    const dateTypeId = input.dateTypeIds.get(item.dateTypeName);
    if (!dateTypeId) return [];
    return [{
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      dateTypeId,
      dateValue: googleDateAtNoon(item.dateValue),
      month: item.month,
      day: item.day,
      recurrence: item.recurrence,
      timezone: input.timezone,
      label: item.label,
      source: "GOOGLE" as const,
      externalId: `${input.record.externalId}:${item.dateTypeName.toLowerCase()}`,
      isActive: true
    }];
  });
}

async function createGoogleContact(input: {
  workspaceId: string;
  actorUserId: string | null;
  timezone: string;
  record: GoogleContactRecord;
  dateTypeIds: Map<string, string>;
}): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const contact = await tx.contact.create({
      data: {
        workspaceId: input.workspaceId,
        firstName: clean(input.record.firstName, 120),
        lastName: clean(input.record.lastName, 120),
        displayName: input.record.displayName ?? primaryEmail(input.record) ?? primaryPhone(input.record) ?? "Google Contact",
        company: clean(input.record.company, 240),
        publicNotes: clean(input.record.publicNotes, 20_000),
        source: "GOOGLE",
        emails: input.record.emails.length ? {
          create: input.record.emails.map((item) => ({
            email: item.value.trim(),
            normalized: normalizeEmail(item.value),
            label: clean(item.label, 80),
            isPrimary: item.isPrimary
          }))
        } : undefined,
        phones: input.record.phones.length ? {
          create: input.record.phones.map((item) => ({
            phone: item.value.trim(),
            normalized: normalizePhone(item.value)!,
            label: clean(item.label, 80),
            isPrimary: item.isPrimary
          }))
        } : undefined,
        addresses: input.record.addresses.length ? { create: input.record.addresses } : undefined
      }
    });
    const dates = incomingDateRows({ ...input, contactId: contact.id });
    if (dates.length) await tx.jumpDate.createMany({ data: dates });
    await tx.externalContactLink.upsert({
      where: {
        workspaceId_provider_externalId: {
          workspaceId: input.workspaceId,
          provider: "GOOGLE_CONTACTS",
          externalId: input.record.externalId
        }
      },
      create: {
        workspaceId: input.workspaceId,
        contactId: contact.id,
        provider: "GOOGLE_CONTACTS",
        externalId: input.record.externalId,
        etag: input.record.etag,
        lastSeenAt: new Date()
      },
      update: { contactId: contact.id, etag: input.record.etag, deletedAt: null, lastSeenAt: new Date() }
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorType: input.actorUserId ? "USER" : "SYSTEM",
        actorUserId: input.actorUserId,
        action: "contact.sync.google.create",
        entityType: "Contact",
        entityId: contact.id,
        source: "google.contacts",
        metadata: { externalId: input.record.externalId, dateCount: dates.length }
      }
    });
    return contact.id;
  });
}

async function mergeGoogleContact(input: {
  workspaceId: string;
  actorUserId: string | null;
  timezone: string;
  record: GoogleContactRecord;
  contactId: string;
  preferGoogleCanonical: boolean;
  dateTypeIds: Map<string, string>;
}): Promise<string> {
  const existing = await prisma.contact.findFirst({
    where: { id: input.contactId, workspaceId: input.workspaceId, archivedAt: null },
    include: { emails: true, phones: true, addresses: true, jumpDates: true }
  });
  if (!existing) throw new Error("The linked local Contact is no longer available.");

  await prisma.$transaction(async (tx) => {
    const firstName = input.preferGoogleCanonical
      ? clean(input.record.firstName, 120) ?? existing.firstName
      : existing.firstName ?? clean(input.record.firstName, 120);
    const lastName = input.preferGoogleCanonical
      ? clean(input.record.lastName, 120) ?? existing.lastName
      : existing.lastName ?? clean(input.record.lastName, 120);
    const company = input.preferGoogleCanonical
      ? clean(input.record.company, 240) ?? existing.company
      : existing.company ?? clean(input.record.company, 240);
    const proposedName = input.record.displayName ?? ([firstName, lastName].filter(Boolean).join(" ") || company);
    const displayName = input.preferGoogleCanonical
      ? proposedName || existing.displayName
      : existing.displayName || proposedName || "Google Contact";
    await tx.contact.update({
      where: { id: existing.id },
      data: {
        firstName,
        lastName,
        company,
        displayName,
        publicNotes: appendGoogleNotes(existing.publicNotes, input.record.publicNotes)
      }
    });

    const emailByKey = new Map(existing.emails.map((item) => [item.normalized, item]));
    const hasPrimaryEmail = existing.emails.some((item) => item.isPrimary);
    for (const item of input.record.emails) {
      const normalized = normalizeEmail(item.value);
      const found = emailByKey.get(normalized);
      if (found) {
        if (input.preferGoogleCanonical) {
          await tx.contactEmail.update({
            where: { id: found.id },
            data: { email: item.value.trim(), label: clean(item.label, 80) }
          });
        }
      } else {
        await tx.contactEmail.create({
          data: {
            contactId: existing.id,
            email: item.value.trim(),
            normalized,
            label: clean(item.label, 80),
            isPrimary: !hasPrimaryEmail && item.isPrimary
          }
        });
      }
    }

    const phoneByKey = new Map(existing.phones.map((item) => [item.normalized, item]));
    const hasPrimaryPhone = existing.phones.some((item) => item.isPrimary);
    for (const item of input.record.phones) {
      const normalized = normalizePhone(item.value);
      if (!normalized) continue;
      const found = phoneByKey.get(normalized);
      if (found) {
        if (input.preferGoogleCanonical) {
          await tx.contactPhone.update({
            where: { id: found.id },
            data: { phone: item.value.trim(), label: clean(item.label, 80) }
          });
        }
      } else {
        await tx.contactPhone.create({
          data: {
            contactId: existing.id,
            phone: item.value.trim(),
            normalized,
            label: clean(item.label, 80),
            isPrimary: !hasPrimaryPhone && item.isPrimary
          }
        });
      }
    }

    const existingAddressKeys = new Set(existing.addresses.map(addressKey));
    for (const item of input.record.addresses) {
      const key = addressKey(item);
      if (existingAddressKeys.has(key)) continue;
      await tx.contactAddress.create({
        data: { contactId: existing.id, ...item, isPrimary: !existing.addresses.some((address) => address.isPrimary) && item.isPrimary }
      });
      existingAddressKeys.add(key);
    }

    const incomingDates = incomingDateRows({ ...input, contactId: existing.id });
    const existingDateKeys = new Set(existing.jumpDates.map((item) => jumpDateKey({ ...item, recurrence: item.recurrence })));
    const missingDates = incomingDates.filter((item) => !existingDateKeys.has(jumpDateKey({
      dateTypeId: item.dateTypeId,
      label: item.label ?? null,
      dateValue: item.dateValue ?? null,
      month: item.month ?? null,
      day: item.day ?? null,
      recurrence: String(item.recurrence ?? "")
    })));
    if (missingDates.length) await tx.jumpDate.createMany({ data: missingDates });

    await tx.externalContactLink.upsert({
      where: {
        workspaceId_provider_externalId: {
          workspaceId: input.workspaceId,
          provider: "GOOGLE_CONTACTS",
          externalId: input.record.externalId
        }
      },
      create: {
        workspaceId: input.workspaceId,
        contactId: existing.id,
        provider: "GOOGLE_CONTACTS",
        externalId: input.record.externalId,
        etag: input.record.etag,
        lastSeenAt: new Date()
      },
      update: { contactId: existing.id, etag: input.record.etag, deletedAt: null, lastSeenAt: new Date() }
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorType: input.actorUserId ? "USER" : "SYSTEM",
        actorUserId: input.actorUserId,
        action: "contact.sync.google.update",
        entityType: "Contact",
        entityId: existing.id,
        source: "google.contacts",
        metadata: { externalId: input.record.externalId, dateCount: missingDates.length }
      }
    });
  });
  return existing.id;
}

function errorSummary(errors: string[]): string | null {
  if (!errors.length) return null;
  const unique = [...new Set(errors)];
  return unique.slice(0, 10).join(" | ").slice(0, 2000);
}

export async function runGoogleContactsSync(input: {
  connectionId: string;
  syncRunId: string;
  actorUserId?: string | null;
}): Promise<GoogleSyncResult> {
  const connection = await prisma.integrationConnection.findUnique({
    where: { id: input.connectionId },
    include: { workspace: { include: { profile: true } } }
  });
  if (!connection || connection.provider !== "GOOGLE_CONTACTS") throw new Error("Google Contacts connection not found.");
  if (!PLAN_LIMITS[connection.workspace.planTier].googleContacts) throw new Error("Google Contacts requires a Plus or Pro plan.");
  if (connection.status !== "ACTIVE" && connection.status !== "ERROR") throw new Error("Reconnect Google Contacts before syncing.");

  await prisma.syncRun.update({
    where: { id: input.syncRunId },
    data: { status: "RUNNING", startedAt: new Date(), errorSummary: null }
  });
  const config = configFromConnection(connection);
  const errors: string[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const planned = await recordsAndDecisions({
      connection,
      config,
      syncToken: connection.syncCursor
    });
    const createCount = planned.decisions.filter((item) => item.kind === "CREATE").length;
    const activeContacts = planned.contacts.length;
    const remainingCapacity = Math.max(PLAN_LIMITS[connection.workspace.planTier].contacts - activeContacts, 0);
    if (createCount > remainingCapacity) {
      throw new Error(
        `This sync would create ${createCount.toLocaleString()} Contacts, but the ${connection.workspace.planTier.toLowerCase()} plan has room for ${remainingCapacity.toLocaleString()}. Upgrade or archive Contacts before syncing.`
      );
    }

    const dateTypeIds = await resolveDateTypeIds(
      connection.workspaceId,
      connection.workspace.planTier,
      planned.records.flatMap((record) => record.jumpDates.map((item) => item.dateTypeName))
    );
    const touchedContactIds = new Set<string>();
    for (const decision of planned.decisions) {
      try {
        if (decision.kind === "DELETED") {
          if (decision.targetContactId) {
            await prisma.externalContactLink.updateMany({
              where: {
                workspaceId: connection.workspaceId,
                provider: "GOOGLE_CONTACTS",
                externalId: decision.record.externalId,
                contactId: decision.targetContactId
              },
              data: { deletedAt: new Date(), lastSeenAt: new Date(), etag: decision.record.etag }
            });
          }
          skipped += 1;
          continue;
        }
        if (decision.kind === "REVIEW" || decision.kind === "SKIP") {
          skipped += 1;
          continue;
        }
        if (decision.kind === "CREATE") {
          const contactId = await createGoogleContact({
            workspaceId: connection.workspaceId,
            actorUserId: input.actorUserId ?? null,
            timezone: connection.workspace.profile?.timezone ?? "America/New_York",
            record: decision.record,
            dateTypeIds
          });
          touchedContactIds.add(contactId);
          created += 1;
          continue;
        }
        if (!decision.targetContactId) throw new Error("The Google Contact does not have a valid local merge target.");
        const contactId = await mergeGoogleContact({
          workspaceId: connection.workspaceId,
          actorUserId: input.actorUserId ?? null,
          timezone: connection.workspace.profile?.timezone ?? "America/New_York",
          record: decision.record,
          contactId: decision.targetContactId,
          preferGoogleCanonical: decision.kind === "LINKED",
          dateTypeIds
        });
        touchedContactIds.add(contactId);
        updated += 1;
      } catch (error) {
        failed += 1;
        errors.push(`${decision.record.displayName ?? decision.record.externalId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (touchedContactIds.size) {
      await prisma.job.create({ data: { workspaceId: connection.workspaceId, task: "generate-jumps", payload: {} } });
    }
    const summary = { created, updated, skipped, failed };
    const existingMetadata = readGoogleConnectionMetadata(connection.metadata);
    const nextSyncAt = new Date(Date.now() + env.googleSyncHours * 60 * 60 * 1000);
    await prisma.$transaction([
      prisma.integrationConnection.update({
        where: { id: connection.id },
        data: {
          status: "ACTIVE",
          syncCursor: planned.response.nextSyncToken ?? connection.syncCursor,
          lastSyncAt: new Date(),
          nextSyncAt,
          lastError: errorSummary(errors),
          metadata: {
            ...existingMetadata,
            selectedGroupResourceNames: config.selectedGroupResourceNames,
            selectedGroupLabels: config.selectedGroupLabels,
            autoMergeExact: config.autoMergeExact,
            lastSummary: summary
          } as Prisma.InputJsonValue
        }
      }),
      prisma.syncRun.update({
        where: { id: input.syncRunId },
        data: {
          status: failed ? "COMPLETED_WITH_ERRORS" : "COMPLETED",
          completedAt: new Date(),
          createdCount: created,
          updatedCount: updated,
          skippedCount: skipped,
          errorCount: failed,
          errorSummary: errorSummary(errors)
        }
      })
    ]);
    return {
      ...summary,
      nextSyncToken: planned.response.nextSyncToken,
      fullSync: planned.response.fullSync
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Contacts sync failed.";
    await prisma.$transaction([
      prisma.syncRun.updateMany({
        where: { id: input.syncRunId },
        data: { status: "FAILED", completedAt: new Date(), errorCount: Math.max(failed, 1), errorSummary: message.slice(0, 2000) }
      }),
      prisma.integrationConnection.updateMany({
        where: { id: connection.id, status: { not: "REVOKED" } },
        data: { status: "ERROR", lastError: message.slice(0, 1000), nextSyncAt: null }
      })
    ]);
    throw error;
  }
}

export async function queueGoogleContactsSync(input: {
  workspaceId: string;
  connectionId: string;
  actorUserId: string | null;
  config?: Partial<GoogleSyncConfig>;
  requestedMode?: "MANUAL" | "INITIAL" | "SCHEDULED";
}): Promise<{ runId: string; mode: string }> {
  const connection = await prisma.integrationConnection.findFirst({
    where: { id: input.connectionId, workspaceId: input.workspaceId, provider: "GOOGLE_CONTACTS" },
    include: { workspace: true }
  });
  if (!connection) throw new Error("Google Contacts connection not found.");
  if (!PLAN_LIMITS[connection.workspace.planTier].googleContacts) throw new Error("Google Contacts requires a Plus or Pro plan.");
  if (connection.status === "REVOKED" || !connection.credentialsCiphertext) throw new Error("Reconnect Google Contacts before syncing.");
  const activeRun = await prisma.syncRun.findFirst({
    where: { connectionId: connection.id, status: { in: ACTIVE_RUN_STATUSES } },
    select: { id: true }
  });
  if (activeRun) return { runId: activeRun.id, mode: "ALREADY_RUNNING" };

  const previous = configFromConnection(connection);
  const config = normalizeConfig(input.config ?? previous);
  const groupSelectionChanged = !sameStringSet(previous.selectedGroupResourceNames, config.selectedGroupResourceNames);
  const mode = input.requestedMode === "SCHEDULED"
    ? "SCHEDULED"
    : connection.syncCursor && !groupSelectionChanged
      ? "INCREMENTAL"
      : "INITIAL";
  const existingMetadata = readGoogleConnectionMetadata(connection.metadata);
  const result = await prisma.$transaction(async (tx) => {
    await tx.integrationConnection.update({
      where: { id: connection.id },
      data: {
        status: "ACTIVE",
        ...(groupSelectionChanged ? { syncCursor: null } : {}),
        metadata: {
          ...existingMetadata,
          selectedGroupResourceNames: config.selectedGroupResourceNames,
          selectedGroupLabels: config.selectedGroupLabels,
          autoMergeExact: config.autoMergeExact
        } as Prisma.InputJsonValue,
        lastError: null
      }
    });
    const run = await tx.syncRun.create({
      data: { workspaceId: input.workspaceId, connectionId: connection.id, mode, status: "QUEUED" }
    });
    await tx.job.create({
      data: {
        workspaceId: input.workspaceId,
        task: GOOGLE_SYNC_TASK,
        payload: { connectionId: connection.id, syncRunId: run.id, actorUserId: input.actorUserId }
      }
    });
    return run;
  });
  return { runId: result.id, mode };
}

export async function enqueueDueGoogleContactsSyncs(): Promise<number> {
  const due = await prisma.integrationConnection.findMany({
    where: {
      provider: "GOOGLE_CONTACTS",
      status: "ACTIVE",
      nextSyncAt: { lte: new Date() },
      workspace: { planTier: { in: ["PLUS", "PRO"] } }
    },
    select: { id: true, workspaceId: true },
    take: 50
  });
  let queued = 0;
  const bucket = new Date().toISOString().slice(0, 13);
  for (const connection of due) {
    const key = `google-sync-schedule:${connection.id}:${bucket}`;
    try {
      await prisma.idempotencyKey.create({
        data: {
          workspaceId: connection.workspaceId,
          key,
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
        }
      });
      const result = await queueGoogleContactsSync({
        workspaceId: connection.workspaceId,
        connectionId: connection.id,
        actorUserId: null,
        requestedMode: "SCHEDULED"
      });
      if (result.mode !== "ALREADY_RUNNING") queued += 1;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code !== "P2002") console.error("Unable to queue scheduled Google Contacts sync", error);
    }
  }
  return queued;
}

export function googleSyncJobTask(): string {
  return GOOGLE_SYNC_TASK;
}
