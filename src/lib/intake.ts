import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeEmail, normalizePhone, isValidEmail } from "@/lib/contact-input";
import { applyJourneyEvent } from "@/lib/journey";

const short = (max: number) => z.string().trim().max(max).optional().default("");
const intakeSchema = z.object({
  eventId: z.string().trim().min(1).max(180),
  externalId: short(180), displayName: short(160), firstName: short(80), lastName: short(80), company: short(160),
  email: short(254), phone: short(40), message: short(4000),
  eventType: z.enum(["CONTACT_RECEIVED", "CONVERSATION_STARTED", "MEETING_SCHEDULED", "SALE_CONFIRMED", "WORK_COMPLETED"]).default("CONTACT_RECEIVED")
}).strict();
export type IntakePayload = z.infer<typeof intakeSchema>;
export class IntakeError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function parseIntakePayload(value: unknown): IntakePayload {
  const parsed = intakeSchema.safeParse(value);
  if (!parsed.success) throw new IntakeError("Map an eventId and supported contact fields. Names are limited to 160 characters and messages to 4,000 characters.");
  const data = parsed.data;
  if (data.email && !isValidEmail(data.email)) throw new IntakeError("Provide a valid email address.");
  if (data.phone && !normalizePhone(data.phone)) throw new IntakeError("Provide a phone number with 7–15 digits, including its country code when available.");
  if (!data.email && !data.phone && !data.externalId) throw new IntakeError("Include an email, phone number, or stable externalId.");
  data.email = data.email ? normalizeEmail(data.email) : "";
  data.phone = data.phone ? normalizePhone(data.phone)! : "";
  return data;
}

export async function intakeMatches(tx: Prisma.TransactionClient, workspaceId: string, connectionId: string, data: IntakePayload) {
  const identity = data.externalId ? await tx.intakeIdentity.findUnique({ where: { connectionId_externalId: { connectionId, externalId: data.externalId } } }) : null;
  const conditions: Prisma.ContactWhereInput[] = [];
  if (data.email) conditions.push({ emails: { some: { normalized: data.email } } });
  if (data.phone) conditions.push({ phones: { some: { normalized: data.phone } } });
  if (identity) conditions.push({ id: identity.contactId });
  return conditions.length ? tx.contact.findMany({ where: { workspaceId, OR: conditions }, select: { id: true, displayName: true, archivedAt: true }, take: 21 }) : [];
}

async function acceptIntake(tx: Prisma.TransactionClient, connection: { id: string; workspaceId: string; name: string; kind: string }, data: IntakePayload, existingId?: string) {
  const contact = existingId ? await tx.contact.findFirst({ where: { id: existingId, workspaceId: connection.workspaceId, archivedAt: null } }) : await tx.contact.create({ data: {
    workspaceId: connection.workspaceId, displayName: data.displayName || [data.firstName, data.lastName].filter(Boolean).join(" ") || data.company || data.email || data.phone || "New contact",
    firstName: data.firstName || null, lastName: data.lastName || null, company: data.company || null, source: connection.kind === "HOSTED_FORM" ? "WEBSITE" : "API",
    emails: data.email ? { create: { email: data.email, normalized: data.email, isPrimary: true } } : undefined,
    phones: data.phone ? { create: { phone: data.phone, normalized: data.phone, isPrimary: true } } : undefined
  } });
  if (!contact) throw new IntakeError("Choose an active contact in this business.");
  // Incoming submissions never overwrite contact details, permissions, or stops.
  // The full submitted fields remain reviewable in the source receipt.
  if (data.externalId) await tx.intakeIdentity.upsert({ where: { connectionId_externalId: { connectionId: connection.id, externalId: data.externalId } }, create: { connectionId: connection.id, externalId: data.externalId, contactId: contact.id }, update: { contactId: contact.id } });
  await tx.contactActivity.create({ data: { workspaceId: connection.workspaceId, contactId: contact.id, kind: "SYSTEM", visibility: "WORKSPACE", summary: `${existingId ? "New inquiry" : "Contact received"} from ${connection.name}.${data.message ? ` ${data.message}` : ""}`, metadata: { intakeConnectionId: connection.id, eventId: data.eventId, sourceKind: connection.kind, ...(connection.kind === "HOSTED_FORM" ? { permissionToRespond: true } : {}), submittedName: data.displayName || [data.firstName,data.lastName].filter(Boolean).join(" "), submittedEmail: data.email, submittedPhone: data.phone, submittedCompany: data.company } } });
  await applyJourneyEvent(tx, { workspaceId: connection.workspaceId, contactId: contact.id, eventKey: `intake:${connection.id}:${data.eventId}`, eventType: data.eventType, source: connection.name });
  return contact;
}

export async function receiveIntake(connectionId: string, raw: unknown, credential: { tokenHash?: string; publicForm?: boolean }) {
  const data = parseIntakePayload(raw);
  if (credential.publicForm && (data.eventType !== "CONTACT_RECEIVED" || data.externalId || (!data.email && !data.phone))) throw new IntakeError("Include your email or phone number.");
  const payloadHash = createHash("sha256").update(JSON.stringify(data)).digest("hex");
  const connection = await prisma.intakeConnection.findUnique({ where: { id: connectionId } });
  if (!connection) throw new IntakeError("Connection unavailable.", 401);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${connection.workspaceId} FOR NO KEY UPDATE`;
    const current = await tx.intakeConnection.findUnique({ where: { id: connectionId } });
    if (!current?.enabled || (credential.publicForm ? current.kind !== "HOSTED_FORM" : !credential.tokenHash || current.tokenHash !== credential.tokenHash || current.kind === "HOSTED_FORM")) throw new IntakeError("Connection unavailable.", 401);
    const existing = await tx.intakeReceipt.findUnique({ where: { connectionId_eventKey: { connectionId, eventKey: data.eventId } } });
    if (existing) {
      if (existing.payloadHash !== payloadHash) throw new IntakeError("This eventId was already used with different details. Use the original payload or a new eventId.", 409);
      return { receiptId: existing.id, contactId: existing.contactId, status: existing.status, duplicate: true };
    }
    const matches = await intakeMatches(tx, current.workspaceId, current.id, data);
    const needsReview = matches.length > 1 || matches.some(contact => contact.archivedAt);
    const contact = needsReview ? null : await acceptIntake(tx, current, data, matches[0]?.id);
    const receipt = await tx.intakeReceipt.create({ data: { connectionId, eventKey: data.eventId, payloadHash, status: needsReview ? "REVIEW" : "ACCEPTED", contactId: contact?.id, payload: data } });
    return { receiptId: receipt.id, contactId: receipt.contactId, status: receipt.status, duplicate: false };
  }, { timeout: 15_000 });
}

export async function resolveIntake(workspaceId: string, receiptId: string, decision: "ignore" | "create" | "link", contactId?: string, actorUserId?: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspaceId} FOR NO KEY UPDATE`;
    const receipt = await tx.intakeReceipt.findFirst({ where: { id: receiptId, connection: { workspaceId }, status: "REVIEW" }, include: { connection: true } });
    if (!receipt) throw new IntakeError("This inquiry was already reviewed or is unavailable.");
    if (decision === "link" && !contactId) throw new IntakeError("Choose a contact to link this inquiry to.");
    const contact = decision === "ignore" ? null : await acceptIntake(tx, receipt.connection, parseIntakePayload(receipt.payload), decision === "link" ? contactId : undefined);
    await tx.intakeReceipt.update({ where: { id: receipt.id }, data: { status: decision === "ignore" ? "IGNORED" : "ACCEPTED", contactId: contact?.id } });
    await tx.auditLog.create({ data: { workspaceId, actorType: "USER", actorUserId, action: "intake.review", entityType: "IntakeReceipt", entityId: receipt.id, source: "settings.connections", afterData: { decision, contactId: contact?.id ?? null } } });
    return contact;
  }, { timeout: 15_000 });
}
