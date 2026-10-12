"use client";

import type { ReactNode } from "react";

/** Closes the sheet, and any confirmation over it, as soon as one of its forms marked `data-closes-menu` is sent. The
 *  action's redirect then shows its notice on the page instead of under a menu that stayed open (D77). */
export function ClosesOnSubmit({ children }: { children: ReactNode }) {
  return <div className="closes-on-submit" onSubmit={event => {
    const form = event.target as Element;
    if (!form.matches("form[data-closes-menu]")) return;
    for (let dialog = form.closest("dialog"); dialog; dialog = dialog.parentElement?.closest("dialog") ?? null) dialog.close();
  }}>{children}</div>;
}
