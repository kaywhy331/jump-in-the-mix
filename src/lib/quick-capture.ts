import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { saveCalendarEntryIn } from "@/lib/calendar";
import { parseCalendarTime } from "@/lib/calendar-time";
import { isValidEmail, normalizeEmail, normalizePhone } from "@/lib/contact-input";
import { canonicalPhoneKey, phoneLookupKeys, workspacePhoneRegion } from "@/lib/phone-number";
import { applyJourneyEvent } from "@/lib/journey";
import { placeNewContacts } from "@/lib/new-contact-placement";
import { createOneTimeFollowUp } from "@/lib/one-time-follow-up";
import { containsPrivateNotesPlaceholder, findUnknownPlaceholders } from "@/lib/placeholders";
import { quickCaptureSchema, type QuickCaptureContact, type QuickCaptureReceipt } from "@/lib/quick-capture-input";
import { splitContactName } from "@/lib/quick-add-capture";

export class QuickCaptureError extends Error {
  constructor(message: string, public contacts: QuickCaptureContact[] = [], public receipt?: QuickCaptureReceipt) { super(message); }
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const contactSelect = { id: true, displayName: true, archivedAt: true, emails: { select: { email: true }, orderBy: { isPrimary: "desc" as const }, take: 1 }, phones: { select: { phone: true }, orderBy: { isPrimary: "desc" as const }, take: 1 } };
const candidate = (c: { id: string; displayName: string; archivedAt: Date | null; emails: { email: string }[]; phones: { phone: string }[] }): QuickCaptureContact => ({ id: c.id, displayName: c.displayName, archived: Boolean(c.archivedAt), email: c.emails[0]?.email ?? null, phone: c.phones[0]?.phone ?? null });

export async function searchQuickCaptureContacts(workspaceId: string, query: string) {
  const q = query.trim().slice(0, 200);
  if (!q) return [];
  // A typed number finds the person under its canonical key or, for a row saved before the phone-key change, its old one.
  const phoneKeys = normalizePhone(q) ? phoneLookupKeys(q, await workspacePhoneRegion(prisma, workspaceId)) : [];
  return (await prisma.contact.findMany({ where: { workspaceId, OR: [{ displayName: { contains: q, mode: "insensitive" } }, { emails: { some: { normalized: { contains: normalizeEmail(q) } } } }, ...phoneKeys.map((key) => ({ phones: { some: { normalized: { contains: key } } } }))] }, select: contactSelect, orderBy: [{ archivedAt: "asc" }, { displayName: "asc" }, { id: "asc" }], take: 10 })).map(candidate);
}

/** All selected records and the retry receipt commit together. Identity is supplied only by the authenticated route. */
export async function saveQuickCapture(context: { workspaceId: string; actorUserId: string; timezone: string }, input: unknown): Promise<QuickCaptureReceipt> {
  const parsed = quickCaptureSchema.safeParse(input);
  if (!parsed.success) throw new QuickCaptureError(parsed.error.issues[0]?.message ?? "Check the capture details.");
  const data = parsed.data;
  const { workspaceId, actorUserId, timezone } = context;
  const hash = digest(JSON.stringify(data));
  const key = `quick-capture:${actorUserId}:${data.requestId}`;
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR NO KEY UPDATE`;
    const previous = await tx.idempotencyKey.findUnique({ where: { workspaceId_key: { workspaceId, key } } });
    if (previous) {
      const saved = previous.response as { hash: string; receipt: QuickCaptureReceipt };
      if (saved.hash !== hash) throw new QuickCaptureError("Your earlier capture was saved. Later edits have not been applied.", [], saved.receipt);
      return saved.receipt;
    }
    let contactId: string;
    const createdPerson = data.person.mode === "new";
    if (data.person.mode === "existing") {
      const person = await tx.contact.findFirst({ where: { id: data.person.id, workspaceId, archivedAt: null } });
      if (!person) throw new QuickCaptureError("Choose an available person in your contacts.");
      contactId = person.id;
      if (!data.note && !data.event && !data.followUp) throw new QuickCaptureError("Choose a note, event, or follow-up to save for this person.");
    } else {
      const { name, phone, email, allowDuplicate } = data.person;
      if (email && !isValidEmail(email)) throw new QuickCaptureError("Enter a valid email address or leave it blank.");
      if (phone && !normalizePhone(phone)) throw new QuickCaptureError("Enter a valid phone number or leave it blank.");
      const region = await workspacePhoneRegion(tx, workspaceId);
      const matches = await tx.contact.findMany({ where: { workspaceId, OR: [{ displayName: { equals: name, mode: "insensitive" } }, ...(email ? [{ emails: { some: { normalized: normalizeEmail(email) } } }] : []), ...(phone ? [{ phones: { some: { normalized: { in: phoneLookupKeys(phone, region) } } } }] : [])] }, select: contactSelect, take: 10 });
      if (matches.length && !allowDuplicate) throw new QuickCaptureError("There may already be a person with these details. Choose them, or confirm this is a different person.", matches.map(candidate));
      const names = splitContactName(name);
      const person = await tx.contact.create({ data: { workspaceId, displayName: name, ...names, ...(email ? { emails: { create: { email, normalized: normalizeEmail(email), isPrimary: true } } } : {}), ...(phone ? { phones: { create: { phone, normalized: canonicalPhoneKey(phone, region), isPrimary: true } } } : {}) } });
      contactId = person.id;
      await applyJourneyEvent(tx, { workspaceId, contactId, actorUserId, eventKey: `contact-created:${contactId}`, eventType: "CONTACT_RECEIVED", source: "Quick Add" });
      await placeNewContacts(tx, { workspaceId, contactIds: [contactId] });
    }
    let eventId: string | null = null, jumpId: string | null = null, noteId: string | null = null;
    if (data.note) {
      noteId = (await tx.contactActivity.create({ data: { workspaceId, contactId, actorUserId, kind: "PRIVATE_UPDATE", visibility: "PRIVATE", summary: data.note, metadata: { source: "quick-add" } } })).id;
    }
    if (data.event) {
      try {
        eventId = (await saveCalendarEntryIn(tx, { workspaceId, actorUserId, contactId, kind: "MEETING", title: data.event.title, startsAt: parseCalendarTime(data.event.startsAt, timezone), endsAt: parseCalendarTime(data.event.endsAt, timezone), timezone, location: data.event.location, allowOverlap: data.event.allowOverlap })).id;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) throw error;
        throw new QuickCaptureError(error instanceof Error ? error.message : "Check the event details.");
      }
    }
    if (data.followUp) {
      const followUp = data.followUp;
      if (await tx.contactRelationshipState.findFirst({ where: { workspaceId, contactId, doNotContact: true } })) throw new QuickCaptureError("Do-not-contact is enabled for this person. Remove the follow-up or review their contact permissions.");
      if (followUp.channel === "EMAIL" && !followUp.subject) throw new QuickCaptureError("Add an email subject.");
      const written = ["SMS", "EMAIL", "WHATSAPP"].includes(followUp.channel);
      const content = { subject: followUp.channel === "EMAIL" ? followUp.subject : null, body: written ? followUp.wording : null, script: written ? null : followUp.wording };
      if (findUnknownPlaceholders([content.subject, content.body, content.script].filter(Boolean).join("\n")).length) throw new QuickCaptureError("Remove unrecognized placeholders from the follow-up wording.");
      if (written && containsPrivateNotesPlaceholder(followUp.wording + followUp.subject)) throw new QuickCaptureError("Private notes can only be used in call notes.");
      let scheduledAt: Date;
      try { scheduledAt = parseCalendarTime(followUp.when, timezone); } catch (error) { throw new QuickCaptureError(error instanceof Error ? error.message : "Choose a follow-up date and time."); }
      jumpId = await createOneTimeFollowUp(tx, { workspaceId, contactId, actorUserId, scheduledAt, reason: followUp.reason, channel: followUp.channel, content, key, batchId: data.requestId });
    }
    const receipt = { contactId, createdPerson, eventId, jumpId, noteId };
    await tx.auditLog.create({ data: { workspaceId, actorType: "USER", actorUserId, action: "quick-capture.save", entityType: "Contact", entityId: contactId, source: "quick-add", metadata: receipt } });
    if (createdPerson) await tx.job.create({ data: { workspaceId, task: "generate-jumps", payload: {} } });
    await tx.idempotencyKey.create({ data: { workspaceId, key, response: { hash, receipt }, expiresAt: new Date(Date.now() + 7 * 86_400_000) } });
    return receipt;
  }, { timeout: 15_000 });
}
