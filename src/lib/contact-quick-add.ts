import { commitContactImportBatch, findImportMatches } from "@/lib/contact-import-service";
import type { ImportCommitResult, ImportMatch, ImportResolution } from "@/lib/contact-import-types";
import { deviceContactToImportRecord, type DeviceContactInput } from "@/lib/device-contact";
import { prisma } from "@/lib/prisma";

export type QuickAddItemResult = {
  rowId: string;
  displayName: string;
  matchKind: ImportMatch["kind"];
  status: ImportCommitResult["status"];
  message: string;
  existingContactName: string | null;
};

export type QuickAddResult = {
  summary: {
    selected: number;
    created: number;
    merged: number;
    reviewNeeded: number;
    skipped: number;
    failed: number;
  };
  items: QuickAddItemResult[];
};

function resolutionForMatch(match: ImportMatch): ImportResolution {
  if (match.kind === "NONE") {
    return { rowId: match.rowId, action: "CREATE", targetContactId: null };
  }
  if (match.kind === "EXACT" && match.candidates.length === 1) {
    return { rowId: match.rowId, action: "MERGE", targetContactId: match.candidates[0].contactId };
  }
  return { rowId: match.rowId, action: "SKIP", targetContactId: null };
}

export async function quickAddDeviceContacts(input: {
  workspaceId: string;
  actorUserId: string;
  timezone: string;
  requestId: string;
  contacts: DeviceContactInput[];
  /** Where the people came from, for the audit record: the browser picker or a card shared from the phone. */
  source?: "contacts.device-picker" | "contacts.phone-share";
}): Promise<QuickAddResult> {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(input.requestId)) throw new Error("The Quick Add request identifier is invalid.");
  if (!input.contacts.length || input.contacts.length > 50) throw new Error("Choose between 1 and 50 device Contacts at a time.");

  const records = input.contacts.map((contact, index) => deviceContactToImportRecord(contact, index, input.requestId));
  const analysis = await findImportMatches(input.workspaceId, records);
  const matchByRowId = new Map(analysis.matches.map((match) => [match.rowId, match]));
  const results = await commitContactImportBatch({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    timezone: input.timezone,
    importId: `quick-add-${input.requestId}`,
    items: records.map((record) => {
      const match = matchByRowId.get(record.rowId);
      if (!match) throw new Error("A Quick Add duplicate decision is missing.");
      return { record, resolution: resolutionForMatch(match) };
    })
  });

  const createdContactIds = results
    .filter((result) => result.status === "CREATED" && result.contactId)
    .map((result) => result.contactId as string);
  if (createdContactIds.length) {
    await prisma.contact.updateMany({
      where: { workspaceId: input.workspaceId, id: { in: createdContactIds } },
      data: { source: "API" }
    });
  }

  const resultByRowId = new Map(results.map((result) => [result.rowId, result]));
  const items: QuickAddItemResult[] = records.map((record) => {
    const match = matchByRowId.get(record.rowId)!;
    const result = resultByRowId.get(record.rowId)!;
    return {
      rowId: record.rowId,
      displayName: record.displayName ?? record.firstName ?? record.emails[0]?.value ?? record.phones[0]?.value ?? "Unnamed Contact",
      matchKind: match.kind,
      status: result.status,
      message: result.message,
      existingContactName: match.candidates[0]?.displayName ?? null
    };
  });

  const reviewNeeded = items.filter((item) => item.matchKind === "AMBIGUOUS" || item.matchKind === "FUZZY").length;
  const summary = {
    selected: items.length,
    created: items.filter((item) => item.status === "CREATED").length,
    merged: items.filter((item) => item.status === "MERGED").length,
    reviewNeeded,
    skipped: items.filter((item) => item.status === "SKIPPED").length,
    failed: items.filter((item) => item.status === "FAILED").length
  };

  // Row-level create/merge audit records are already committed by the shared
  // import service. This aggregate diagnostic must not turn a successful Quick
  // Add into an apparent failure if only the supplemental summary write fails.
  await prisma.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorType: "USER",
      actorUserId: input.actorUserId,
      action: "contact.quick-add",
      entityType: "ContactImport",
      source: input.source ?? "contacts.device-picker",
      metadata: { requestId: input.requestId, ...summary }
    }
  }).catch((error) => console.error("Quick Add summary audit failed", error));

  return { summary, items };
}

const people = (count: number) => `${count} ${count === 1 ? "person" : "people"}`;

/** One plain-text answer for a phone share, shown by the iPhone shortcut as its notification. */
export function quickAddSentence(result: QuickAddResult): string {
  const { summary, items } = result;
  if (items.length === 1) {
    const [item] = items;
    if (item.status === "CREATED") return `Added ${item.displayName} to Jump in the Mix.`;
    if (item.status === "MERGED") return `${item.displayName} was already in Jump in the Mix. Any new details were added.`;
    if (item.matchKind === "AMBIGUOUS" || item.matchKind === "FUZZY") return `${item.displayName} may already be in Jump in the Mix, so nothing changed. Check Contacts.`;
    return `${item.displayName} couldn't be added. Add them in Jump in the Mix instead.`;
  }
  const parts = [`Added ${people(summary.created)}.`];
  if (summary.merged) parts.push(`${people(summary.merged)} already saved; any new details were added.`);
  if (summary.reviewNeeded) parts.push(`${people(summary.reviewNeeded)} may already be saved, so nothing changed. Check Contacts.`);
  if (summary.failed) parts.push(`${people(summary.failed)} couldn't be added.`);
  return parts.join(" ");
}
