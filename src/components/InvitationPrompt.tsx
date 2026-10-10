"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useBrowserScope } from "@/components/BrowserAccountBoundary";
import { INVITATION_PROMPT_COOKIE, INVITATIONS_PATH, invitationsLeftLabel, withInvitationPromptDismissed } from "@/lib/invitation-labels";

const CONTROLS = "a[href], button:not([disabled]), summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** The first control after `element` that can take focus now: rendered, and not inside it. */
function nextControl(element: HTMLElement | null) {
  if (!element) return null;
  return [...document.querySelectorAll<HTMLElement>(CONTROLS)].find(control => !element.contains(control) && Boolean(element.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING) && control.getClientRects().length > 0) ?? null;
}

/**
 * Today's one compact invitation prompt (JITM-09 §2.9, D72), shown below the due work once the owner has recorded an
 * outcome. Dismissing it records this account in a cookie, so Today stops rendering it in this browser.
 */
export function InvitationPrompt({ remaining }: { remaining: number }) {
  const scope = useBrowserScope();
  const ref = useRef<HTMLElement>(null);
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const dismiss = () => {
    // Focus moves on to what follows the prompt, or else Today's heading, before the Dismiss button leaves (JITM-10 §2.12).
    const next = nextControl(ref.current) ?? document.querySelector<HTMLElement>(".today-page-header h1");
    setDismissed(true);
    if (scope) {
      const current = document.cookie.split("; ").find(item => item.startsWith(`${INVITATION_PROMPT_COOKIE}=`))?.slice(INVITATION_PROMPT_COOKIE.length + 1);
      document.cookie = `${INVITATION_PROMPT_COOKIE}=${withInvitationPromptDismissed(current, scope)}; Path=/; Max-Age=34560000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    }
    next?.focus();
  };
  return <section ref={ref} className="invite-strip" aria-label="Personal invitations">
    <Link href={INVITATIONS_PATH}><AppIcon name="gift" /><span><strong>Invite people</strong> · <span>{invitationsLeftLabel(remaining)}</span></span></Link>
    <button type="button" className="icon-button" aria-label="Dismiss the invitation prompt" onClick={dismiss}><AppIcon name="close" /></button>
  </section>;
}
