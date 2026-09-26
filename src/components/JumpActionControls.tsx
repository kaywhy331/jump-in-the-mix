"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { useBrowserScope } from "@/components/BrowserAccountBoundary";
import { markAttemptAcknowledged, rememberOpenedJump, type OpenedAttemptPayload } from "@/lib/opened-jump-state";

type JumpActionType = "OPENED" | "COPIED" | "COMPOSED" | "CALLED" | "VOICEMAIL_STARTED";

/** What the page knows about a handoff before the gesture; the id and time are added at the click. */
export type AttemptDraft = Omit<OpenedAttemptPayload, "id" | "openedAt">;

async function recordAction(jumpId: string, action: JumpActionType, attemptId?: string): Promise<void> {
  const response = await fetch(`/api/jumps/${encodeURIComponent(jumpId)}/actions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...(attemptId ? { attemptId } : {}) }),
    keepalive: true
  });
  if (!response.ok) throw new Error("The follow-up action could not be recorded.");
}

// Logging only: nothing here sends a message or opens a composer. The request outlives the page.
async function recordAttempt(jumpId: string, payload: OpenedAttemptPayload): Promise<boolean> {
  const response = await fetch(`/api/jumps/${encodeURIComponent(jumpId)}/attempts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true
  });
  return response.ok;
}

function attemptId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function JumpActionLink({
  jumpId,
  action,
  href,
  className,
  ariaLabel,
  title,
  target,
  contactName,
  channel,
  attempt,
  children
}: {
  jumpId: string;
  action: JumpActionType;
  href: string;
  className?: string;
  ariaLabel: string;
  title?: string;
  target?: string;
  contactName: string;
  channel: string;
  /** The on-screen content and recipient; when present the gesture records an attempt. */
  attempt?: AttemptDraft | null;
  children: ReactNode;
}) {
  const scope = useBrowserScope();
  return (
    <a
      href={href}
      target={target}
      rel={target === "_blank" ? "noreferrer" : undefined}
      className={className}
      aria-label={ariaLabel}
      title={title}
      onClick={(event) => {
        // Close the review sheet so the outcome tray is reachable on return.
        event.currentTarget.closest("dialog")?.close();
        // The native link is followed by the browser right after this handler. Nothing below is
        // awaited, so persistence never delays the phone.
        const openedAt = Date.now();
        const payload: OpenedAttemptPayload | undefined = attempt ? { ...attempt, id: attemptId(), openedAt: new Date(openedAt).toISOString() } : undefined;
        if (scope) rememberOpenedJump({ scope, jumpId, contactName, channel, openedAt, ...(payload ? { attemptId: payload.id, attempt: payload, acknowledged: false } : {}) });
        if (payload) void recordAttempt(jumpId, payload).then((ok) => { if (ok && scope) markAttemptAcknowledged(scope, payload.id); }).catch(() => undefined);
        void recordAction(jumpId, action, payload?.id).catch(() => undefined);
      }}
    >
      {children}
    </a>
  );
}

function copyWithFallback(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

export function JumpCopyButton({ jumpId, text, label = "Copy prepared content" }: { jumpId: string; text: string; label?: string }) {
  const [status, setStatus] = useState<"IDLE" | "COPIED" | "FAILED">("IDLE");

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else if (!copyWithFallback(text)) throw new Error("Copy was not accepted by the browser.");
      await recordAction(jumpId, "COPIED");
      setStatus("COPIED");
      window.setTimeout(() => setStatus("IDLE"), 1600);
    } catch {
      const copied = copyWithFallback(text);
      if (copied) {
        void recordAction(jumpId, "COPIED").catch(() => undefined);
        setStatus("COPIED");
      } else {
        setStatus("FAILED");
      }
      window.setTimeout(() => setStatus("IDLE"), 2000);
    }
  };

  return <button className="button small" type="button" onClick={copy}>{status === "COPIED" ? "Copied" : status === "FAILED" ? "Copy failed" : label}</button>;
}
