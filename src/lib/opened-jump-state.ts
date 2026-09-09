"use client";

import { privateStorageKey } from "@/lib/private-browser-state";

export type OpenedJumpDetail = { scope: string; jumpId: string; contactName: string; channel: string; openedAt: number };
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

export function validOpenedJump(value: unknown, scope: string): value is OpenedJumpDetail {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<OpenedJumpDetail>;
  return item.scope === scope && typeof item.jumpId === "string" && item.jumpId.length > 0
    && typeof item.contactName === "string" && item.contactName.length > 0
    && typeof item.channel === "string" && item.channel.length > 0
    && typeof item.openedAt === "number" && Number.isFinite(item.openedAt)
    && item.openedAt <= Date.now() && Date.now() - item.openedAt <= MAX_AGE_MS;
}

export function rememberOpenedJump(detail: OpenedJumpDetail): void {
  try { window.sessionStorage.setItem(privateStorageKey(detail.scope, "opened-jump"), JSON.stringify(detail)); } catch { /* The current tab still receives the event. */ }
  window.dispatchEvent(new CustomEvent<OpenedJumpDetail>("jitm:jump-opened", { detail }));
}

export function readOpenedJump(scope: string): OpenedJumpDetail | null {
  try {
    const key = privateStorageKey(scope, "opened-jump");
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (validOpenedJump(value, scope)) return value;
    window.sessionStorage.removeItem(key);
  } catch { /* Optional recovery. */ }
  return null;
}

export function clearOpenedJump(scope: string): void {
  try { window.sessionStorage.removeItem(privateStorageKey(scope, "opened-jump")); } catch { /* Optional recovery. */ }
}
