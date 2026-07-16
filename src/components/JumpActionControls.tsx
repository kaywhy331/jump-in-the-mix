"use client";

import type { ReactNode } from "react";
import { useState } from "react";

type JumpActionType = "OPENED" | "COPIED" | "COMPOSED" | "CALLED" | "VOICEMAIL_STARTED";

async function recordAction(jumpId: string, action: JumpActionType): Promise<void> {
  await fetch(`/api/jumps/${encodeURIComponent(jumpId)}/actions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
    keepalive: true
  });
}

export function JumpActionLink({
  jumpId,
  action,
  href,
  className,
  ariaLabel,
  title,
  target,
  children
}: {
  jumpId: string;
  action: JumpActionType;
  href: string;
  className?: string;
  ariaLabel: string;
  title?: string;
  target?: string;
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
      onClick={() => { void recordAction(jumpId, action); }}
    >
      {children}
    </a>
  );
}

function copyWithFallback(text: string): void {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function JumpCopyButton({ jumpId, text }: { jumpId: string; text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else copyWithFallback(text);
      await recordAction(jumpId, "COPIED");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      copyWithFallback(text);
      void recordAction(jumpId, "COPIED");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  return <button className="button small" type="button" onClick={copy}>{copied ? "Copied" : "Copy prepared content"}</button>;
}
