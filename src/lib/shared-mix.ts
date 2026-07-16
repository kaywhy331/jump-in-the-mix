import type { Channel, MixTriggerMode } from "@/generated/prisma/client";
import { containsPrivateNotesPlaceholder, findUnknownPlaceholders } from "@/lib/placeholders";

export const MIX_TEMPLATE_CATEGORIES = [
  "Business",
  "Sales & Prospecting",
  "Client Success / Retention",
  "Events & Networking",
  "Personal / Relationships",
  "Marketing Campaigns",
  "General / Other"
] as const;

export const MIX_TEMPLATE_INDUSTRIES = [
  "Real Estate",
  "Insurance",
  "Finance",
  "Healthcare",
  "Contractors / Home Services",
  "Coaching / Consulting",
  "Nonprofit",
  "General / Other"
] as const;

export type SharedMixStep = {
  name: string;
  channel: Channel;
  dayOffset: number;
  sendTimeMinutes: number | null;
  subject: string | null;
  body: string | null;
  script: string | null;
  longSms: boolean;
  includeOptOut: boolean;
};

export class SharedMixContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SharedMixContentError";
  }
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function firstDefined(record: UnknownRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const next = value.trim();
  return next ? next.slice(0, maxLength) : null;
}

function integer(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
}

function normalizedRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (!record) return [];
  for (const key of ["steps", "jumps", "sequence", "items"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  const content = asRecord(record.content);
  if (content) {
    for (const key of ["steps", "jumps", "sequence", "items"]) {
      if (Array.isArray(content[key])) return content[key] as unknown[];
    }
  }
  return [];
}

export function normalizeSharedMixChannel(value: unknown): Channel | null {
  const raw = cleanString(value, 40)?.toUpperCase().replaceAll("-", "_").replaceAll(" ", "_") ?? "";
  const aliases: Record<string, Channel> = {
    SMS: "SMS",
    TEXT: "SMS",
    TEXT_MESSAGE: "SMS",
    EMAIL: "EMAIL",
    PHONE: "PHONE_CALL",
    CALL: "PHONE_CALL",
    PHONE_CALL: "PHONE_CALL",
    VOICEMAIL: "VOICEMAIL",
    RINGLESS_VOICEMAIL: "VOICEMAIL",
    WHATSAPP: "WHATSAPP",
    WHATS_APP: "WHATSAPP"
  };
  return aliases[raw] ?? null;
}

export function normalizeSharedMixTriggerMode(value: unknown): MixTriggerMode {
  const raw = cleanString(value, 40)?.toUpperCase().replaceAll("-", "_").replaceAll(" ", "_") ?? "";
  if (raw === "DATE" || raw === "DATE_TRIGGERED") return "DATE_TRIGGERED";
  if (raw === "BROADCAST" || raw === "FIXED_DATE") return "BROADCAST";
  return "MANUAL_START";
}

export function sharedMixChannelLabel(channel: Channel): string {
  if (channel === "PHONE_CALL") return "Phone Call";
  if (channel === "VOICEMAIL") return "Voicemail Script";
  if (channel === "WHATSAPP") return "WhatsApp";
  return channel === "EMAIL" ? "Email" : "SMS";
}

export function sharedMixChannelIcon(channel: Channel): string {
  if (channel === "EMAIL") return "✉";
  if (channel === "PHONE_CALL") return "☎";
  if (channel === "VOICEMAIL") return "◉";
  if (channel === "WHATSAPP") return "◌";
  return "●";
}

export function normalizeSharedMixSteps(value: unknown): SharedMixStep[] {
  const rows = normalizedRows(value);
  if (!rows.length) throw new SharedMixContentError("This Mix Template does not contain any Jumps.");
  if (rows.length > 50) throw new SharedMixContentError("A Mix Template may contain at most 50 Jumps.");

  return rows.map((value, index) => {
    const record = asRecord(value);
    if (!record) throw new SharedMixContentError(`Jump #${index + 1} has an invalid structure.`);
    const channel = normalizeSharedMixChannel(firstDefined(record, ["channel", "type", "kind"]));
    if (!channel) throw new SharedMixContentError(`Jump #${index + 1} does not use a supported channel.`);

    const subject = cleanString(firstDefined(record, ["subject", "emailSubject", "email_subject"]), 300);
    let body = cleanString(firstDefined(record, ["body", "message", "content", "text"]), 20_000);
    let script = cleanString(firstDefined(record, ["script", "callScript", "call_script", "notes"]), 20_000);
    if (["PHONE_CALL", "VOICEMAIL"].includes(channel) && !script && body) {
      script = body;
      body = null;
    }

    if (channel === "EMAIL" && (!subject || !body)) {
      throw new SharedMixContentError(`Email Jump #${index + 1} requires both a subject and body.`);
    }
    if (["SMS", "WHATSAPP"].includes(channel) && !body) {
      throw new SharedMixContentError(`${sharedMixChannelLabel(channel)} Jump #${index + 1} requires message content.`);
    }
    if (["PHONE_CALL", "VOICEMAIL"].includes(channel) && !script) {
      throw new SharedMixContentError(`${sharedMixChannelLabel(channel)} Jump #${index + 1} requires a script or notes.`);
    }

    const content = [subject, body, script].filter(Boolean).join("\n");
    const unknown = findUnknownPlaceholders(content);
    if (unknown.length) {
      throw new SharedMixContentError(`Jump #${index + 1} contains unsupported placeholders: ${unknown.join(", ")}.`);
    }
    if (channel !== "PHONE_CALL" && containsPrivateNotesPlaceholder(content)) {
      throw new SharedMixContentError(`Jump #${index + 1} uses Private Notes outside a Phone Call.`);
    }

    const dayOffset = integer(firstDefined(record, ["dayOffset", "day_offset", "triggerDays", "trigger_days", "day", "offset"]));
    if (dayOffset < -3650 || dayOffset > 3650) {
      throw new SharedMixContentError(`Jump #${index + 1} has an unsupported day offset.`);
    }
    const parsedTime = integer(firstDefined(record, ["sendTimeMinutes", "send_time_minutes", "timeMinutes", "time_minutes"]), -1);
    const sendTimeMinutes = parsedTime >= 0 && parsedTime <= 1439 ? parsedTime : null;
    const name = cleanString(firstDefined(record, ["name", "label", "title"]), 160)
      ?? `${sharedMixChannelLabel(channel)} Jump #${index + 1}`;

    return {
      name,
      channel,
      dayOffset,
      sendTimeMinutes,
      subject,
      body,
      script,
      longSms: channel === "SMS" && (booleanValue(firstDefined(record, ["longSms", "long_sms"])) || (body?.length ?? 0) > 160),
      includeOptOut: booleanValue(firstDefined(record, ["includeOptOut", "include_opt_out"]))
    };
  });
}

export function sharedMixContentIssue(value: unknown): string | null {
  try {
    normalizeSharedMixSteps(value);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "This Mix Template has invalid content.";
  }
}

export function sharedMixTrendingScore(input: {
  voteCount: number;
  importCount: number;
  publishedAt: Date | null;
  updatedAt: Date;
}, now = new Date()): number {
  const activityDate = input.publishedAt ?? input.updatedAt;
  const ageDays = Math.max((now.getTime() - activityDate.getTime()) / 86_400_000, 0);
  const freshness = Math.max(30 - ageDays, 0) / 5;
  return input.voteCount * 4 + input.importCount * 2 + freshness;
}

export function formatSharedMixTime(minutes: number | null): string | null {
  if (minutes === null) return null;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}
