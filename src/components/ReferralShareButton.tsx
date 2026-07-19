"use client";

import { useState } from "react";
import { AppIcon } from "@/components/AppIcon";

function copyFallback(value: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  return copied;
}

export function ReferralShareButton({
  message,
  compact = false,
  className = ""
}: {
  message: string;
  compact?: boolean;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "shared" | "copied" | "error">("idle");

  async function share() {
    setState("idle");
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Jump in the Mix", text: message });
        setState("shared");
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
        setState("copied");
        return;
      }
      setState(copyFallback(message) ? "copied" : "error");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState("error");
    }
  }

  const label = state === "copied"
    ? "Invite copied"
    : state === "shared"
      ? "Invite shared"
      : state === "error"
        ? "Copy failed"
        : compact
          ? "Invite"
          : "Invite friends";

  return (
    <button
      className={`${compact ? "button small referral-share-compact" : "button primary"} ${className}`.trim()}
      type="button"
      onClick={share}
      aria-label="Share your Jump in the Mix referral invitation"
    >
      <AppIcon name="external" />
      <span>{label}</span>
    </button>
  );
}
