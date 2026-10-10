"use client";

import Link from "next/link";
import { useLayoutEffect, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { INVITATIONS_PATH } from "@/lib/invitation-labels";

const DISMISSED_KEY = "jitm:invitation-prompt-dismissed";

/**
 * Today's one compact invitation prompt (JITM-09 §2.9, D72), shown below the due sections once the owner has recorded an
 * outcome. Dismissing it hides it in this browser, as dismissing the install prompt does.
 */
export function InvitationPrompt({ remaining }: { remaining: number }) {
  const [dismissed, setDismissed] = useState(false);
  // The page stays hidden until the browser's account check is ready, so a dismissed prompt never shows first.
  useLayoutEffect(() => { try { if (window.localStorage.getItem(DISMISSED_KEY) === "1") setDismissed(true); } catch { /* Optional preference. */ } }, []);
  if (dismissed) return null;
  const dismiss = () => {
    setDismissed(true);
    try { window.localStorage.setItem(DISMISSED_KEY, "1"); } catch { /* Optional preference. */ }
    // The dismiss button leaves with the prompt; Today's heading takes focus.
    document.querySelector<HTMLElement>(".today-page-header h1")?.focus({ preventScroll: true });
  };
  return <section className="invite-strip" aria-label="Personal invitations">
    <AppIcon name="gift" />
    <p><strong>You have {remaining} invitation{remaining === 1 ? "" : "s"} to share.</strong></p>
    <Link className="button small primary" href={INVITATIONS_PATH}>Invite people</Link>
    <button type="button" className="icon-button invite-strip-dismiss" aria-label="Dismiss the invitation prompt" onClick={dismiss}><AppIcon name="close" /></button>
  </section>;
}
