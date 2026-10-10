"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { INVITATIONS_PATH, invitationsLeftLabel } from "@/lib/invitation-labels";
import { dismissInvitationPromptAction } from "@/lib/invitation-prompt-actions";

const CONTROLS = "a[href], button:not([disabled]), summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** The first control after `element` that can take focus now: rendered, and not inside it. */
function nextControl(element: HTMLElement | null) {
  if (!element) return null;
  return [...document.querySelectorAll<HTMLElement>(CONTROLS)].find(control => !element.contains(control) && Boolean(element.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING) && control.getClientRects().length > 0) ?? null;
}

/**
 * Today's one compact invitation prompt (JITM-09 §2.9, D72), shown below the due work once the owner has recorded an
 * outcome. Dismissing it asks the server to remember this account in a cookie, so Today stops rendering it in this
 * browser.
 */
export function InvitationPrompt({ remaining }: { remaining: number }) {
  const ref = useRef<HTMLElement>(null);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const dismiss = () => {
    // Focus moves on to what follows the prompt, or else Today's heading, before the Dismiss button leaves (JITM-10 §2.12).
    const next = nextControl(ref.current) ?? document.querySelector<HTMLElement>(".today-page-header h1");
    setDismissed(true);
    next?.focus();
    // If the request fails, the prompt stays hidden for this visit and shows again on the next.
    dismissInvitationPromptAction().catch(() => undefined);
  };
  return <section ref={ref} className="invite-strip" aria-label="Personal invitations">
    <Link href={INVITATIONS_PATH}><AppIcon name="gift" /><span><strong>Invite people</strong> · <span>{invitationsLeftLabel(remaining)}</span></span></Link>
    <button type="button" className="icon-button" aria-label="Dismiss the invitation prompt" onClick={dismiss}><AppIcon name="close" /></button>
  </section>;
}
