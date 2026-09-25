import { createHash } from "node:crypto";
import type { PreparationFamily } from "@/generated/prisma/client";
import { decryptAttemptRecipient } from "@/lib/jump-attempts";
import { prisma } from "@/lib/prisma";

/*
 * The personal-data export (JSON), written while it is read.
 *
 * Every list is read in pages, each with a keyset on the section's order column plus a unique
 * tie-break, so the server holds one page at a time. Sections keep the order and nesting of the
 * document the route used to build in memory: a tie-break only settles rows that shared a value, and
 * lists that had no stated order are read in creation order. Each page is its own read: no
 * transaction spans the download, so a slow download never pins a pooled connection (the parallel
 * reads this replaces were not a snapshot either).
 */

type Db = typeof prisma;

/** The signed-in owner, as the session provides it. */
export type ExportOwner = { id: string; name: string; email: string; createdAt: Date; updatedAt: Date };

export type AccountExportOptions = {
  user: ExportOwner;
  workspaceId: string;
  /** When the export started; written into the document and the file name. */
  exportedAt: Date;
  /** The client to read with. Tests pass one that records or fails reads. */
  db?: Db;
  /** Caps every page. Tests use tiny pages to cross page boundaries with a small fixture. */
  pageSize?: number;
};

/** Rows read at a time. Sections whose rows carry whole documents read fewer. */
export const EXPORT_PAGE_ROWS = 500;
const ROWS = {
  jumps: 200, // each carries its snapshots and its step version
  templates: 100,
  versions: 100,
  instances: 100, // workflow state documents
  mergeRecords: 100, // source snapshots
  intakeReceipts: 200, // webhook payloads
  imports: 10 // each batch holds its uploaded rows
} as const;

/** Text is handed to the response once this much has built up, or a second after the last hand-off. */
const HAND_OFF_CHARACTERS = 64 * 1024;
const HAND_OFF_INTERVAL_MS = 1_000;

// ---------------------------------------------------------------------------------------------
// Writing JSON while reading it

/** Part of the document that is read while it is written. */
abstract class Streamed {}

/** A list read page by page. `each` shapes a row and may return a Streamed object (nested lists). */
class Rows<Row> extends Streamed {
  constructor(readonly pages: () => AsyncGenerator<Row[]>, readonly each?: (row: Row) => unknown) { super(); }
}

/** An object whose fields are written in order; any field may be Streamed. */
class Fields extends Streamed {
  constructor(readonly entries: ReadonlyArray<readonly [string, unknown]>) { super(); }
}

/** One value, read when the writer reaches it. */
class Later extends Streamed {
  constructor(readonly read: () => Promise<unknown>) { super(); }
}

/** Text that is already JSON. */
class Raw extends Streamed {
  constructor(readonly json: string) { super(); }
}

class Text {
  private parts: string[] = [];
  size = 0;
  add(part: string) { this.parts.push(part); this.size += part.length; }
  take() { const text = this.parts.join(""); this.parts = []; this.size = 0; return text; }
}

/** JSON.stringify's own rules: a Date becomes its ISO string, and undefined in a list becomes null. */
function plain(value: unknown): string {
  return JSON.stringify(value) ?? "null";
}

/** Writes `value` as compact JSON into `text`, yielding after every database read. */
async function* write(text: Text, value: unknown): AsyncGenerator<void> {
  if (!(value instanceof Streamed)) { text.add(plain(value)); return; }
  if (value instanceof Raw) { text.add(value.json); return; }
  if (value instanceof Later) {
    const read = await value.read();
    yield;
    yield* write(text, read);
    return;
  }
  if (value instanceof Fields) {
    text.add("{");
    let first = true;
    for (const [key, field] of value.entries) {
      const json = field instanceof Streamed ? "" : JSON.stringify(field);
      if (json === undefined) continue; // JSON leaves undefined fields out
      text.add(`${first ? "" : ","}${JSON.stringify(key)}:`);
      first = false;
      if (field instanceof Streamed) yield* write(text, field);
      else text.add(json);
    }
    text.add("}");
    return;
  }
  if (value instanceof Rows) {
    text.add("[");
    let first = true;
    for await (const page of value.pages()) {
      for (const row of page) {
        const item = value.each ? value.each(row) : row;
        if (!first) text.add(",");
        first = false;
        if (item instanceof Streamed) yield* write(text, item);
        else text.add(plain(item));
      }
      yield;
    }
    text.add("]");
  }
}

type Read<Row> = (last: Row | undefined, take: number) => Promise<Row[]>;

/** Reads pages until one comes back short; `last` is the previous page's final row. */
async function* pages<Row>(take: number, read: Read<Row>): AsyncGenerator<Row[]> {
  let last: Row | undefined;
  for (;;) {
    const page = await read(last, take);
    yield page;
    if (page.length < take) return;
    last = page[page.length - 1];
  }
}

// ---------------------------------------------------------------------------------------------
// Keysets

/** Rows after `last` in (column, tie) order: a later column value, or the same one and a later tie. */
function after<R, K extends keyof R & string, T extends keyof R & string>(column: K, tie: T, last: R | undefined): Array<{ OR: Array<Record<K, { gt: R[K] }> | (Record<K, R[K]> & Record<T, { gt: R[T] }>)> }> {
  if (!last) return [];
  const later = { [column]: { gt: last[column] } } as Record<K, { gt: R[K] }>;
  const tied = { [column]: last[column], [tie]: { gt: last[tie] } } as Record<K, R[K]> & Record<T, { gt: R[T] }>;
  return [{ OR: [later, tied] }];
}

/** Rows after `last` when the column alone is unique. */
function afterKey<R, K extends keyof R & string>(column: K, last: R | undefined): Array<Record<K, { gt: R[K] }>> {
  return last ? [{ [column]: { gt: last[column] } } as Record<K, { gt: R[K] }>] : [];
}

type ByCreated = { createdAt: Date; id: string } | undefined;
type ByOccurred = { occurredAt: Date; id: string } | undefined;
const CREATED: [{ createdAt: "asc" }, { id: "asc" }] = [{ createdAt: "asc" }, { id: "asc" }];
const OCCURRED: [{ occurredAt: "asc" }, { id: "asc" }] = [{ occurredAt: "asc" }, { id: "asc" }];

/** Drafts sort by last save, then follow-up, then family; a follow-up has at most one draft per family. */
function draftReader(db: Db, workspaceId: string): Read<{ updatedAt: Date; jumpId: string; family: PreparationFamily }> {
  // The families already written for the final (updatedAt, jumpId) pair; Prisma has no "greater than" for enums.
  let tail: { updatedAt: Date; jumpId: string; families: PreparationFamily[] } | undefined;
  return async (_last, take) => {
    const edge = tail;
    const page = await db.jumpDraft.findMany({
      where: {
        workspaceId,
        AND: edge ? [{ OR: [
          { updatedAt: { gt: edge.updatedAt } },
          { updatedAt: edge.updatedAt, jumpId: { gt: edge.jumpId } },
          { updatedAt: edge.updatedAt, jumpId: edge.jumpId, family: { notIn: edge.families } }
        ] }] : []
      },
      orderBy: [{ updatedAt: "asc" }, { jumpId: "asc" }, { family: "asc" }],
      take
    });
    for (const draft of page) {
      if (tail && tail.updatedAt.getTime() === draft.updatedAt.getTime() && tail.jumpId === draft.jumpId) tail.families.push(draft.family);
      else tail = { updatedAt: draft.updatedAt, jumpId: draft.jumpId, families: [draft.family] };
    }
    return page;
  };
}

// ---------------------------------------------------------------------------------------------
// The document

const CONTACT_DETAILS = {
  relationshipState: true,
  emails: { orderBy: CREATED },
  phones: { orderBy: CREATED },
  addresses: { orderBy: CREATED },
  jumpDates: { include: { dateType: true }, orderBy: CREATED },
  customFieldValues: { include: { definition: true }, orderBy: CREATED },
  groupMemberships: { include: { group: true }, orderBy: CREATED }
} as const;

const JUMP_DETAILS = {
  contact: { select: { displayName: true } },
  mix: { select: { name: true } },
  stepVersion: { include: { stepTemplate: { select: { channel: true } } } }
} as const;

const EXCLUDED_SECURITY_MATERIAL = ["password hashes", "session tokens", "provider credentials", "provider webhook payloads", "connection keys and private calendar URLs", "push endpoints and authentication keys", "invitation tokens"];
const EXCLUDED_OPERATIONAL_DATA = ["platform staff administration and analytics", "shared system-catalog source records", "internal job, transport and audit queues"];

/** A row's own fields, then one list read page by page in place of a nested include. */
function nest(row: object, key: string, rows: Streamed): Fields {
  return new Fields([...Object.entries(row), [key, rows]]);
}

/** Drops the id that a section reads only as its tie-break. */
function withoutId<Row extends { id: string }>({ id: _tieBreak, ...row }: Row): Omit<Row, "id"> {
  return row;
}

/** Every workflow instance carries a copy of the workspace definition; each distinct copy is written once. */
function shareDefinition(definitions: Map<string, string>, definition: unknown): string {
  const json = JSON.stringify(definition) ?? "null";
  const id = createHash("sha256").update(json, "utf8").digest("hex").slice(0, 16);
  if (!definitions.has(id)) definitions.set(id, json);
  return id;
}

function accountDocument({ user, workspaceId, exportedAt, db = prisma, pageSize }: AccountExportOptions): Fields {
  const userId = user.id;
  const size = (rows: number) => Math.max(1, Math.min(rows, pageSize ?? rows));
  const list = <Row>(rows: number, read: Read<Row>, each?: (row: Row) => unknown) => new Rows<Row>(() => pages(size(rows), read), each);
  const one = (read: () => Promise<unknown>) => new Later(read);
  const definitions = new Map<string, string>();
  const standard = EXPORT_PAGE_ROWS;

  return new Fields([
    ["format", "jump-in-the-mix-personal-export"],
    ["exportedAt", exportedAt.toISOString()],
    ["account", new Fields([
      ["id", user.id],
      ["name", user.name],
      ["email", user.email],
      ["signInMethods", list(standard, (last: ByCreated, take: number) => db.authIdentity.findMany({ where: { userId, AND: after("createdAt", "id", last) }, select: { id: true, provider: true, email: true, createdAt: true, updatedAt: true }, orderBy: CREATED, take }), withoutId)],
      ["createdAt", user.createdAt],
      ["updatedAt", user.updatedAt]
    ])],
    ["preferences", new Fields([
      ["profile", one(() => db.workspaceProfile.findUnique({ where: { workspaceId } }))],
      ["userPreference", one(() => db.userPreference.findUnique({ where: { userId } }))],
      ["schedulingPreference", one(() => db.workspacePreference.findUnique({ where: { workspaceId } }))],
      ["notificationPreference", one(() => db.notificationPreference.findUnique({ where: { workspaceId } }))],
      ["automationPreference", one(() => db.automationPreference.findUnique({ where: { workspaceId } }))]
    ])],
    ["contacts", list(standard, (last: ByCreated, take: number) => db.contact.findMany({ where: { workspaceId, AND: after("createdAt", "id", last) }, include: CONTACT_DETAILS, orderBy: CREATED, take }))],
    ["activities", list(standard, (last: ByOccurred, take: number) => db.contactActivity.findMany({ where: { workspaceId, AND: after("occurredAt", "id", last) }, orderBy: OCCURRED, take }))],
    ["groups", list(standard, (last: ByCreated, take: number) => db.group.findMany({ where: { workspaceId, AND: after("createdAt", "id", last) }, orderBy: CREATED, take }),
      (group) => nest(group, "memberships", list(standard, (last: ByCreated, take: number) => db.contactGroupMembership.findMany({ where: { groupId: group.id, AND: after("createdAt", "id", last) }, orderBy: CREATED, take }))))],
    ["dateTypes", list(standard, (last: ByCreated, take: number) => db.dateType.findMany({ where: { OR: [{ workspaceId }, { workspaceId: null, isSystem: true }], AND: after("createdAt", "id", last) }, orderBy: CREATED, take }))],
    ["templates", list(ROWS.templates, (last: ByCreated, take: number) => db.stepTemplate.findMany({ where: { workspaceId, AND: after("createdAt", "id", last) }, orderBy: CREATED, take }),
      (template) => nest(template, "versions", list(ROWS.versions, (last: { version: number } | undefined, take: number) => db.stepVersion.findMany({ where: { stepTemplateId: template.id, AND: afterKey("version", last) }, include: { variants: { orderBy: { family: "asc" } } }, orderBy: { version: "asc" }, take }))))],
    ["mixes", list(standard, (last: ByCreated, take: number) => db.mix.findMany({ where: { workspaceId, AND: after("createdAt", "id", last) }, include: { steps: { orderBy: CREATED } }, orderBy: CREATED, take }),
      (mix) => nest(mix, "assignments", list(standard, (last: ByCreated, take: number) => db.mixAssignment.findMany({ where: { mixId: mix.id, AND: after("createdAt", "id", last) }, orderBy: CREATED, take }))))],
    ["jumps", list(ROWS.jumps, (last: { scheduledAt: Date; id: string } | undefined, take: number) => db.jump.findMany({ where: { workspaceId, AND: after("scheduledAt", "id", last) }, include: JUMP_DETAILS, orderBy: [{ scheduledAt: "asc" }, { id: "asc" }], take }))],
    ["followUpDrafts", list(standard, draftReader(db, workspaceId))],
    // The owner's own export shows which address or number each attempt used, decrypted.
    ["followUpAttempts", list(standard, (last: ByCreated, take: number) => db.jumpAttempt.findMany({ where: { workspaceId, AND: after("createdAt", "id", last) }, orderBy: CREATED, take }),
      ({ recipientCiphertext, ...attempt }) => ({ ...attempt, recipient: decryptAttemptRecipient(recipientCiphertext) }))],
    ["appointmentBindings", list(standard, (last: ByCreated, take: number) => db.appointmentBinding.findMany({ where: { workspaceId, AND: after("createdAt", "id", last) }, orderBy: CREATED, take }))],
    ["imports", list(ROWS.imports, (last: ByCreated, take: number) => db.contactImportBatch.findMany({ where: { workspaceId, AND: after("createdAt", "id", last) }, orderBy: CREATED, take }))],
    ["reviewRequests", list(standard, (last: ByCreated, take: number) => db.reviewRequest.findMany({ where: { workspaceId, AND: after("createdAt", "id", last) }, select: { id: true, contactId: true, status: true, rating: true, feedback: true, openedAt: true, respondedAt: true, reviewClickedAt: true, referralClickedAt: true, expiresAt: true, createdAt: true, updatedAt: true }, orderBy: CREATED, take }))],
    ["automatedDeliveries", list(standard, (last: ByCreated, take: number) => db.automatedDelivery.findMany({ where: { workspaceId, AND: after("createdAt", "id", last) }, orderBy: CREATED, take }))],
    ["journey", new Fields([
      ["preference", one(() => db.journeyPreference.findUnique({ where: { workspaceId } }))],
      ["stages", list(standard, (last: { position: number; id: string } | undefined, take: number) => db.journeyStage.findMany({ where: { workspaceId, AND: after("position", "id", last) }, orderBy: [{ position: "asc" }, { id: "asc" }], take }),
        (stage) => nest(stage, "outgoingRules", list(standard, (last: { id: string } | undefined, take: number) => db.journeyRule.findMany({ where: { fromStageId: stage.id, AND: afterKey("id", last) }, orderBy: { id: "asc" }, take }))))],
      ["contacts", list(standard, (last: { contactId: string } | undefined, take: number) => db.contactJourney.findMany({ where: { workspaceId, AND: afterKey("contactId", last) }, orderBy: { contactId: "asc" }, take }))],
      ["events", list(standard, (last: ByOccurred, take: number) => db.journeyEvent.findMany({ where: { workspaceId, AND: after("occurredAt", "id", last) }, orderBy: OCCURRED, take }))]
    ])],
    ["mixWorkflow", new Fields([
      ["configuration", one(() => db.mixWorkflow.findUnique({ where: { workspaceId } }))],
      ["instances", list(ROWS.instances, (last: ByCreated, take: number) => db.mixWorkflowInstance.findMany({ where: { workspaceId, AND: after("createdAt", "id", last) }, orderBy: CREATED, take }),
        ({ definition, ...instance }) => ({ ...instance, definitionId: shareDefinition(definitions, definition) }))],
      // Collected while the instances were written, so they follow the instances.
      ["definitions", new Rows(async function* () {
        yield [...definitions].map(([id, json]) => new Raw(`{"id":${JSON.stringify(id)},"definition":${json}}`));
      })]
    ])],
    ["mixFavorites", list(standard, (last: ByCreated, take: number) => db.mixFavorite.findMany({ where: { workspaceId, userId, AND: after("createdAt", "id", last) }, orderBy: CREATED, take }))],
    ["megaMixInstallations", list(standard, (last: ByCreated, take: number) => db.megaMixInstallation.findMany({ where: { workspaceId, AND: after("createdAt", "id", last) }, orderBy: CREATED, take }))],
    ["megaMixPipelines", list(standard, (last: ByCreated, take: number) => db.megaMixPipeline.findMany({ where: { workspaceId, AND: after("createdAt", "id", last) }, include: { members: { orderBy: [{ position: "asc" }, { mixId: "asc" }] } }, orderBy: CREATED, take }))],
    ["marketplace", new Fields([
      ["author", one(() => db.marketplaceAuthor.findUnique({ where: { workspaceId } }))],
      ["listings", list(standard, (last: ByCreated, take: number) => db.marketplaceListing.findMany({ where: { workspaceId, AND: after("createdAt", "id", last) }, include: { _count: { select: { favorites: true, imports: true } } }, orderBy: CREATED, take }))],
      ["favorites", list(standard, (last: { createdAt: Date; listingId: string } | undefined, take: number) => db.marketplaceFavorite.findMany({ where: { workspaceId, userId, AND: after("createdAt", "listingId", last) }, select: { listingId: true, createdAt: true }, orderBy: [{ createdAt: "asc" }, { listingId: "asc" }], take }))],
      ["imports", list(standard, (last: ByCreated, take: number) => db.marketplaceImport.findMany({ where: { workspaceId, AND: after("createdAt", "id", last) }, orderBy: CREATED, take }))],
      // Reports this account made; reports about its shares omit who reported them.
      ["reportsMade", list(standard, (last: ByCreated, take: number) => db.marketplaceReport.findMany({ where: { reporterWorkspaceId: workspaceId, AND: after("createdAt", "id", last) }, select: { id: true, listingId: true, reason: true, details: true, status: true, createdAt: true }, orderBy: CREATED, take }), withoutId)],
      ["reportsReceived", list(standard, (last: ByCreated, take: number) => db.marketplaceReport.findMany({ where: { listing: { workspaceId }, AND: after("createdAt", "id", last) }, select: { id: true, listingId: true, reason: true, details: true, status: true, reviewNote: true, createdAt: true }, orderBy: CREATED, take }), withoutId)]
    ])],
    ["mixStops", list(standard, (last: { stoppedAt: Date; id: string } | undefined, take: number) => db.mixStop.findMany({ where: { workspaceId, AND: after("stoppedAt", "id", last) }, orderBy: [{ stoppedAt: "asc" }, { id: "asc" }], take }))],
    ["contactGroupStates", list(standard, (last: { createdAt: Date; groupId: string } | undefined, take: number) => db.contactGroupState.findMany({ where: { workspaceId, AND: after("createdAt", "groupId", last) }, orderBy: [{ createdAt: "asc" }, { groupId: "asc" }], take }))],
    ["customFieldDefinitions", list(standard, (last: ByCreated, take: number) => db.contactCustomFieldDefinition.findMany({ where: { workspaceId, AND: after("createdAt", "id", last) }, orderBy: CREATED, take }))],
    ["savedContactViews", list(standard, (last: ByCreated, take: number) => db.contactSavedView.findMany({ where: { workspaceId, userId, AND: after("createdAt", "id", last) }, orderBy: CREATED, take }))],
    ["contactMergeRecords", list(ROWS.mergeRecords, (last: ByCreated, take: number) => db.contactMergeRecord.findMany({ where: { workspaceId, AND: after("createdAt", "id", last) }, orderBy: CREATED, take }))],
    ["handoffEvents", list(standard, (last: ByOccurred, take: number) => db.jumpActionEvent.findMany({ where: { workspaceId, AND: after("occurredAt", "id", last) }, orderBy: OCCURRED, take }))],
    ["broadcastSchedules", list(standard, (last: ByCreated, take: number) => db.mixBroadcastSchedule.findMany({ where: { workspaceId, AND: after("createdAt", "id", last) }, orderBy: CREATED, take }))],
    ["marketingPreference", one(() => db.workspaceMarketingPreference.findUnique({ where: { workspaceId } }))],
    ["sharedMixImports", list(standard, (last: ByCreated, take: number) => db.sharedMixImport.findMany({ where: { workspaceId, AND: after("createdAt", "id", last) }, orderBy: CREATED, take }))],
    ["supportTickets", list(standard, (last: ByCreated, take: number) => db.supportTicket.findMany({ where: { workspaceId, requesterUserId: userId, AND: after("createdAt", "id", last) }, select: { id: true, reference: true, title: true, category: true, priority: true, status: true, createdAt: true, updatedAt: true, resolvedAt: true, closedAt: true }, orderBy: CREATED, take }),
      (ticket) => nest(ticket, "messages", list(standard, (last: ByCreated, take: number) => db.supportTicketMessage.findMany({ where: { ticketId: ticket.id, AND: after("createdAt", "id", last) }, select: { id: true, authorType: true, body: true, createdAt: true, emailStatus: true }, orderBy: CREATED, take }))))],
    ["reminderDeliveries", list(standard, (last: ByCreated, take: number) => db.notificationDelivery.findMany({ where: { workspaceId, userId, AND: after("createdAt", "id", last) }, orderBy: CREATED, take }))],
    ["reminderDevices", list(standard, (last: ByCreated, take: number) => db.pushSubscription.findMany({ where: { workspaceId, userId, AND: after("createdAt", "id", last) }, select: { id: true, userAgent: true, lastUsedAt: true, createdAt: true }, orderBy: CREATED, take }),
      (device) => nest(device, "followUpDeliveries", list(standard, (last: ByCreated, take: number) => db.followUpPushDelivery.findMany({ where: { subscriptionId: device.id, AND: after("createdAt", "id", last) }, select: { id: true, jumpId: true, scheduledAt: true, status: true, deliveredAt: true, createdAt: true }, orderBy: CREATED, take }), withoutId)))],
    ["accessInvitations", list(standard, (last: ByCreated, take: number) => db.referralAccessInvite.findMany({ where: { workspaceId, inviterUserId: userId, AND: after("createdAt", "id", last) }, select: { id: true, contactId: true, recipientEmail: true, recipientPhone: true, manualDelivery: true, lastSentAt: true, acceptedAt: true, revokedAt: true, createdAt: true }, orderBy: CREATED, take }))],
    ["calendar", new Fields([
      ["entries", list(standard, (last: { startsAt: Date; id: string } | undefined, take: number) => db.calendarEntry.findMany({ where: { workspaceId, AND: after("startsAt", "id", last) }, orderBy: [{ startsAt: "asc" }, { id: "asc" }], take }))],
      ["connections", list(standard, (last: ByCreated, take: number) => db.calendarConnection.findMany({ where: { workspaceId, AND: after("createdAt", "id", last) }, select: { id: true, name: true, enabled: true, lastSyncedAt: true, lastAttemptAt: true, lastError: true, createdAt: true }, orderBy: CREATED, take }))]
    ])],
    ["leadIntake", new Fields([
      ["connections", list(standard, (last: ByCreated, take: number) => db.intakeConnection.findMany({ where: { workspaceId, AND: after("createdAt", "id", last) }, select: { id: true, name: true, kind: true, enabled: true, createdAt: true }, orderBy: CREATED, take }))],
      ["receipts", list(ROWS.intakeReceipts, (last: ByCreated, take: number) => db.intakeReceipt.findMany({ where: { connection: { workspaceId }, AND: after("createdAt", "id", last) }, orderBy: CREATED, take }))],
      ["identities", list(standard, (last: { connectionId: string; externalId: string } | undefined, take: number) => db.intakeIdentity.findMany({ where: { connection: { workspaceId }, AND: after("connectionId", "externalId", last) }, orderBy: [{ connectionId: "asc" }, { externalId: "asc" }], take }))]
    ])],
    ["excludedSecurityMaterial", EXCLUDED_SECURITY_MATERIAL],
    ["excludedOperationalData", EXCLUDED_OPERATIONAL_DATA]
  ]);
}

// ---------------------------------------------------------------------------------------------
// Output

/**
 * The export as JSON text, in pieces handed off after database reads. Once `signal` aborts, it stops
 * after the read in progress (hand-offs are batched, so this is checked after every read).
 */
export async function* accountExportJson(options: AccountExportOptions, signal?: AbortSignal): AsyncGenerator<string> {
  const text = new Text();
  let handedOffAt = 0;
  for await (const _read of write(text, accountDocument(options))) {
    if (signal?.aborted) return;
    if (text.size && (!handedOffAt || text.size >= HAND_OFF_CHARACTERS || Date.now() - handedOffAt >= HAND_OFF_INTERVAL_MS)) {
      yield text.take();
      handedOffAt = Date.now();
    }
  }
  if (text.size) yield text.take();
}

/**
 * Opens the export as a byte stream that reads a page only when the download asks for more.
 *
 * The first page is read before this resolves, so a database that cannot be reached still fails the
 * request with 500. After the first byte the status is already sent: a failed read errors the stream
 * (the transfer is aborted, so the browser reports a failed download instead of saving a truncated
 * file), and a cancelled download stops the reads.
 */
export async function openAccountExport(options: AccountExportOptions): Promise<ReadableStream<Uint8Array>> {
  const stop = new AbortController();
  const json = accountExportJson(options, stop.signal);
  const encoder = new TextEncoder();
  const first = await json.next();
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (first.done) controller.close();
      else controller.enqueue(encoder.encode(first.value));
    },
    async pull(controller) {
      try {
        const next = await json.next();
        if (cancelled) return;
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      } catch (error) {
        // Never close here: a closed stream would save the partial file as a finished download.
        if (!cancelled) controller.error(error);
      }
    },
    async cancel() {
      cancelled = true;
      stop.abort();
      await json.return(undefined);
    }
  });
}
