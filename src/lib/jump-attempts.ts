import { createHash, createHmac } from "node:crypto";
import { Prisma, type Channel } from "@/generated/prisma/client";
import { normalizeEmail, normalizePhone } from "@/lib/contact-input";
import { env } from "@/lib/env";
import { decryptIntegrationCredentials, encryptIntegrationCredentials } from "@/lib/integration-crypto";
import { DRAFT_LIMITS, isPreparationFamily, preparationFamilyForChannel, type PreparationFamily } from "@/lib/preparation-family";
import { attemptChannelAllowed } from "@/lib/preparation-variants";
import { prisma } from "@/lib/prisma";

const CHANNELS: Channel[] = ["SMS", "EMAIL", "PHONE_CALL", "VOICEMAIL", "WHATSAPP"];
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const VERSION_KEYS = ["contactVersion", "businessProfileVersion", "calendarEntryVersion"] as const;

export type AttemptContextVersions = { contactVersion: string; businessProfileVersion: string; calendarEntryVersion?: string };

/** The immutable content of one handoff, as the page built it at the gesture. */
export type AttemptPayload = {
  id: string;
  contactId: string;
  channel: Channel;
  family: PreparationFamily;
  recipient: string;
  subject: string | null;
  body: string | null;
  script: string | null;
  draftRevision: number | null;
  stepVersionId: string;
  contextVersions: AttemptContextVersions;
  openedAt: string;
};

export type AttemptFailure = { ok: false; reason: "invalid" | "unavailable" | "mismatch"; message: string };
export type RecordAttemptResult = { ok: true; attemptId: string; duplicate: boolean } | AttemptFailure;

function text(value: unknown, maximum: number, name: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new RangeError(`The ${name} could not be read.`);
  if (value.length > maximum) throw new RangeError(`The ${name} is too long to record.`);
  return value;
}

/** Validates a payload from the browser. Nothing here is trusted for authorization. */
export function parseAttemptPayload(raw: unknown): AttemptPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new RangeError("The attempt could not be read.");
  const input = raw as Record<string, unknown>;
  if (typeof input.id !== "string" || !UUID_V4.test(input.id)) throw new RangeError("The attempt id is invalid.");
  if (typeof input.contactId !== "string" || !ID_PATTERN.test(input.contactId)) throw new RangeError("The attempt's person is invalid.");
  if (typeof input.channel !== "string" || !CHANNELS.includes(input.channel as Channel)) throw new RangeError("The attempt's channel is invalid.");
  const channel = input.channel as Channel;
  if (!isPreparationFamily(input.family) || input.family !== preparationFamilyForChannel(channel)) throw new RangeError("The attempt's message type does not match its channel.");
  if (typeof input.recipient !== "string" || !input.recipient.trim() || input.recipient.length > 254) throw new RangeError("The attempt's recipient is invalid.");
  if (typeof input.stepVersionId !== "string" || !ID_PATTERN.test(input.stepVersionId)) throw new RangeError("The attempt's plan step is invalid.");
  const revision = input.draftRevision;
  if (revision !== null && revision !== undefined && (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1)) throw new RangeError("The attempt's draft revision is invalid.");
  const versions = input.contextVersions;
  if (!versions || typeof versions !== "object" || Array.isArray(versions)) throw new RangeError("The attempt's context is invalid.");
  const contextVersions: Record<string, string> = {};
  for (const [key, value] of Object.entries(versions as Record<string, unknown>)) {
    if (!(VERSION_KEYS as readonly string[]).includes(key) || typeof value !== "string" || !value || value.length > 64) throw new RangeError("The attempt's context is invalid.");
    contextVersions[key] = value;
  }
  if (!contextVersions.contactVersion || !contextVersions.businessProfileVersion) throw new RangeError("The attempt's context is incomplete.");
  const openedAt = typeof input.openedAt === "string" ? new Date(input.openedAt) : new Date(Number.NaN);
  if (!Number.isFinite(openedAt.getTime()) || Math.abs(openedAt.getTime() - Date.now()) > 30 * 24 * 60 * 60_000) throw new RangeError("The attempt's time is invalid.");
  return {
    id: input.id.toLowerCase(),
    contactId: input.contactId,
    channel,
    family: input.family,
    recipient: input.recipient,
    subject: text(input.subject, DRAFT_LIMITS.subject, "subject"),
    body: text(input.body, DRAFT_LIMITS.body, "message"),
    script: text(input.script, DRAFT_LIMITS.script, "call notes"),
    draftRevision: revision ?? null,
    stepVersionId: input.stepVersionId,
    contextVersions: contextVersions as AttemptContextVersions,
    openedAt: openedAt.toISOString()
  };
}

/** Stable-key hash of the immutable fields, computed only from validated values. */
export function attemptPayloadHash(jumpId: string, payload: AttemptPayload): string {
  const versions = Object.fromEntries(Object.entries(payload.contextVersions).sort(([left], [right]) => left.localeCompare(right)));
  const immutable = {
    body: payload.body,
    channel: payload.channel,
    contactId: payload.contactId,
    contextVersions: versions,
    draftRevision: payload.draftRevision,
    family: payload.family,
    jumpId,
    openedAt: payload.openedAt,
    recipient: payload.recipient,
    script: payload.script,
    stepVersionId: payload.stepVersionId,
    subject: payload.subject
  };
  return createHash("sha256").update(JSON.stringify(immutable)).digest("hex");
}

export function normalizeRecipient(channel: Channel, recipient: string): string {
  return channel === "EMAIL" ? normalizeEmail(recipient) : normalizePhone(recipient) ?? recipient.trim();
}

/** Keyed hash of the normalized recipient, for matching and reporting without decrypting. */
export function recipientHash(channel: Channel, recipient: string): string {
  return createHmac("sha256", env.dataEncryptionKey).update(`attempt-recipient:${normalizeRecipient(channel, recipient)}`).digest("hex");
}

export function decryptAttemptRecipient(ciphertext: string): string | null {
  if (!ciphertext) return null;
  try { return decryptIntegrationCredentials<string>(ciphertext); } catch { return null; }
}

// A retry of an id that already exists records a handoff that already happened: it is judged
// only against the stored row, never against the contact's methods as they are now.
async function acknowledgeExisting(workspaceId: string, jumpId: string, id: string, payloadHash: string): Promise<RecordAttemptResult | null> {
  const existing = await prisma.jumpAttempt.findUnique({ where: { id }, select: { workspaceId: true, jumpId: true, payloadHash: true } });
  if (!existing) return null;
  if (existing.workspaceId === workspaceId && existing.jumpId === jumpId && existing.payloadHash === payloadHash) return { ok: true, attemptId: id, duplicate: true };
  return { ok: false, reason: "mismatch", message: "The recorded attempt differs from what this device holds." };
}

/**
 * Records an attempt once. The insert is a single statement keyed by the client id, so two
 * concurrent requests cannot both succeed; the loser compares payload hashes and is acknowledged
 * when identical or refused when different. The recipient and contact checks apply only to the
 * first creation of an id; an authorized retry of an existing id is acknowledged even after the
 * contact's methods changed. The stored row is never merged or rewritten here, and no path from
 * this function sends anything.
 */
export async function recordJumpAttempt(input: { workspaceId: string; jumpId: string; payload: AttemptPayload }): Promise<RecordAttemptResult> {
  const { workspaceId, jumpId, payload } = input;
  const payloadHash = attemptPayloadHash(jumpId, payload);
  const acknowledged = await acknowledgeExisting(workspaceId, jumpId, payload.id, payloadHash);
  if (acknowledged) return acknowledged;
  const jump = await prisma.jump.findFirst({
    where: { id: jumpId, workspaceId },
    select: {
      accessInvite: { select: { recipientEmail: true, recipientPhone: true, acceptedAt: true, revokedAt: true } },
      contactId: true,
      templateSnapshot: true,
      contact: { select: { emails: { select: { normalized: true } }, phones: { select: { normalized: true } }, relationshipState: { select: { preferredChannel: true } } } },
      stepVersion: { select: { stepTemplate: { select: { channel: true } } } }
    }
  });
  if (!jump) return { ok: false, reason: "unavailable", message: "Follow-up not found." };
  if (jump.contactId !== payload.contactId) return { ok: false, reason: "invalid", message: "This follow-up belongs to a different person now." };
  // The plan's own channel, or an authored alternative's; WhatsApp only when the person asked for it.
  if (!attemptChannelAllowed({ primaryChannel: jump.stepVersion.stepTemplate.channel, snapshot: jump.templateSnapshot, channel: payload.channel, family: payload.family, preferredChannel: jump.contact.relationshipState?.preferredChannel ?? null })) {
    return { ok: false, reason: "invalid", message: "This follow-up uses a different channel." };
  }
  const normalized = normalizeRecipient(payload.channel, payload.recipient);
  if (jump.accessInvite && (jump.accessInvite.revokedAt || jump.accessInvite.acceptedAt || normalized !== normalizeRecipient(payload.channel, jump.accessInvite.recipientEmail ?? jump.accessInvite.recipientPhone ?? ""))) return { ok: false, reason: "unavailable", message: "This invitation is no longer available for this recipient." };
  const stored = payload.channel === "EMAIL" ? jump.contact.emails.map((item) => item.normalized) : jump.contact.phones.map((item) => item.normalized);
  if (!stored.includes(normalized)) return { ok: false, reason: "invalid", message: "That address or number isn't saved for this person." };

  try {
    await prisma.jumpAttempt.create({
      data: {
        id: payload.id,
        workspaceId,
        jumpId,
        contactId: payload.contactId,
        channel: payload.channel,
        family: payload.family,
        recipientCiphertext: encryptIntegrationCredentials(payload.recipient),
        recipientHash: recipientHash(payload.channel, payload.recipient),
        subject: payload.subject,
        body: payload.body,
        script: payload.script,
        draftRevision: payload.draftRevision,
        stepVersionId: payload.stepVersionId,
        contextVersions: payload.contextVersions as Prisma.InputJsonObject,
        payloadHash,
        openedAt: new Date(payload.openedAt)
      }
    });
    return { ok: true, attemptId: payload.id, duplicate: false };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
  }
  // Lost the race to a concurrent create with the same id.
  return await acknowledgeExisting(workspaceId, jumpId, payload.id, payloadHash) ?? { ok: false, reason: "mismatch", message: "The recorded attempt differs from what this device holds." };
}

/** Attaches the outcome reference and time, and nothing else, to an attempt that has none yet. */
export async function attachAttemptOutcome(tx: Prisma.TransactionClient, input: { workspaceId: string; jumpId: string; attemptId: string; outcomeActivityId: string; recordedAt: Date }): Promise<boolean> {
  const updated = await tx.jumpAttempt.updateMany({
    where: { id: input.attemptId, workspaceId: input.workspaceId, jumpId: input.jumpId, outcomeActivityId: null },
    data: { outcomeActivityId: input.outcomeActivityId, recordedAt: input.recordedAt }
  });
  return updated.count === 1;
}
