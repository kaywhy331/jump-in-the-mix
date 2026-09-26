"use client";

import { privateStorageKey } from "@/lib/private-browser-state";

/** The exact content handed to the phone, kept so a return can log it again if the first request was lost. */
export type OpenedAttemptPayload = {
  id: string;
  contactId: string;
  channel: string;
  family: "TEXT" | "EMAIL" | "CALL";
  recipient: string;
  subject: string | null;
  body: string | null;
  script: string | null;
  draftRevision: number | null;
  stepVersionId: string;
  contextVersions: Record<string, string>;
  openedAt: string;
};

export type OpenedJumpDetail = {
  scope: string;
  jumpId: string;
  contactName: string;
  channel: string;
  openedAt: number;
  /** Present when the page recorded a handoff attempt for this gesture. */
  attemptId?: string;
  attempt?: OpenedAttemptPayload;
  /** True once the server acknowledged the attempt; a return then sends only the id. */
  acknowledged?: boolean;
};

const MAX_AGE_MS = 2 * 60 * 60 * 1000;
/** Unresolved handoffs kept per account. Older ones drop off; nothing here grants authority. */
export const MAX_UNRESOLVED_ATTEMPTS = 8;
const CURRENT = "opened-jump";
const UNRESOLVED = "opened-attempts";

function validAttempt(value: unknown): value is OpenedAttemptPayload {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<OpenedAttemptPayload>;
  return typeof item.id === "string" && item.id.length > 0 && typeof item.contactId === "string" && typeof item.channel === "string"
    && (item.family === "TEXT" || item.family === "EMAIL" || item.family === "CALL") && typeof item.recipient === "string"
    && typeof item.stepVersionId === "string" && typeof item.openedAt === "string"
    && !!item.contextVersions && typeof item.contextVersions === "object";
}

export function validOpenedJump(value: unknown, scope: string): value is OpenedJumpDetail {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<OpenedJumpDetail>;
  return item.scope === scope && typeof item.jumpId === "string" && item.jumpId.length > 0
    && typeof item.contactName === "string" && item.contactName.length > 0
    && typeof item.channel === "string" && item.channel.length > 0
    && typeof item.openedAt === "number" && Number.isFinite(item.openedAt)
    && item.openedAt <= Date.now() && Date.now() - item.openedAt <= MAX_AGE_MS
    && (item.attemptId === undefined || (typeof item.attemptId === "string" && item.attemptId.length > 0))
    && (item.attempt === undefined || validAttempt(item.attempt));
}

function sameHandoff(left: { attemptId?: string; jumpId: string }, right: { attemptId?: string; jumpId: string }): boolean {
  return left.attemptId && right.attemptId ? left.attemptId === right.attemptId : left.jumpId === right.jumpId;
}

function readList(scope: string): OpenedJumpDetail[] {
  try {
    const raw = window.sessionStorage.getItem(privateStorageKey(scope, UNRESOLVED));
    const value: unknown = raw ? JSON.parse(raw) : [];
    const items = Array.isArray(value) ? value.filter((item): item is OpenedJumpDetail => validOpenedJump(item, scope)) : [];
    return items.sort((left, right) => right.openedAt - left.openedAt).slice(0, MAX_UNRESOLVED_ATTEMPTS);
  } catch { return []; }
}

function writeList(scope: string, items: OpenedJumpDetail[]): void {
  try {
    const key = privateStorageKey(scope, UNRESOLVED);
    if (items.length) window.sessionStorage.setItem(key, JSON.stringify(items.slice(0, MAX_UNRESOLVED_ATTEMPTS)));
    else window.sessionStorage.removeItem(key);
  } catch { /* Memory-only recovery still works for this tab. */ }
}

function writeCurrent(scope: string, detail: OpenedJumpDetail | null): void {
  try {
    const key = privateStorageKey(scope, CURRENT);
    if (detail) window.sessionStorage.setItem(key, JSON.stringify(detail));
    else window.sessionStorage.removeItem(key);
  } catch { /* The current tab still receives the event. */ }
}

/** Remembers a handoff as the current return and adds it to the unresolved list. Re-opening the same follow-up replaces its earlier entry. */
export function rememberOpenedJump(detail: OpenedJumpDetail): void {
  writeCurrent(detail.scope, detail);
  writeList(detail.scope, [detail, ...readList(detail.scope).filter((item) => !sameHandoff(item, detail))]);
  window.dispatchEvent(new CustomEvent<OpenedJumpDetail>("jitm:jump-opened", { detail }));
}

export function readOpenedJump(scope: string): OpenedJumpDetail | null {
  try {
    const key = privateStorageKey(scope, CURRENT);
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (validOpenedJump(value, scope)) return value;
    window.sessionStorage.removeItem(key);
  } catch { /* Optional recovery. */ }
  return null;
}

/** Every handoff still waiting for an outcome, newest first. */
export function readUnresolvedAttempts(scope: string): OpenedJumpDetail[] {
  return readList(scope);
}

export function markAttemptAcknowledged(scope: string, attemptId: string): void {
  writeList(scope, readList(scope).map((item) => (item.attemptId === attemptId ? { ...item, acknowledged: true } : item)));
  const current = readOpenedJump(scope);
  if (current?.attemptId === attemptId) writeCurrent(scope, { ...current, acknowledged: true });
}

/** Removes one handoff and returns the next unresolved one to show, if any. */
export function resolveOpenedJump(scope: string, handoff: { attemptId?: string; jumpId: string }): OpenedJumpDetail | null {
  const remaining = readList(scope).filter((item) => !sameHandoff(item, handoff));
  writeList(scope, remaining);
  const current = readOpenedJump(scope);
  if (current && !sameHandoff(current, handoff)) return current;
  const next = remaining[0] ?? null;
  writeCurrent(scope, next);
  return next;
}

export function clearOpenedJump(scope: string): void {
  try { window.sessionStorage.removeItem(privateStorageKey(scope, CURRENT)); } catch { /* Optional recovery. */ }
}
