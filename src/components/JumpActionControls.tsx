"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import type { OpenedJumpDetail } from "@/components/JumpWorkflow";

type JumpActionType = "OPENED" | "COPIED" | "COMPOSED" | "CALLED" | "VOICEMAIL_STARTED";

async function recordAction(jumpId: string, action: JumpActionType): Promise<void> {
  const response = await fetch(`/api/jumps/${encodeURIComponent(jumpId)}/actions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
    keepalive: true
  });
  if (!response.ok) throw new Error("The Jump action could not be recorded.");
}

function rememberOpenedJump(detail: OpenedJumpDetail): void {
  try { window.sessionStorage.setItem("jitm:opened-jump", JSON.stringify(detail)); } catch { /* Storage can be disabled. */ }
  window.dispatchEvent(new CustomEvent<OpenedJumpDetail>("jitm:jump-opened", { detail }));
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
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target={target}
      rel={target === "_blank" ? "noreferrer" : undefined}
      className={className}
      aria-label={ariaLabel}
      title={title}
      onClick={() => {
        const detail: OpenedJumpDetail = { jumpId, contactName, channel, openedAt: Date.now() };
        rememberOpenedJump(detail);
        void recordAction(jumpId, action).catch(() => undefined);
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
