"use client";

import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import { followBack, type BackReturn } from "@/lib/back-navigation";

/**
 * Phone-familiar back control: a chevron plus the parent screen's name. Where Back returns to the parent it goes back,
 * with the parent's scroll; it is the visible equivalent of the back swipe (JITM-08 §2.46, JITM-10 §2.26). With
 * `returns="origin"`, for a page reached from several places, it goes back to the page the owner came from when that was
 * a page of the app shell, and otherwise opens `href`, its fallback parent (`returnsToOrigin`, JITM-BACK-01). With
 * `returns="address"`, for one exact address, it goes back only to that address and otherwise opens it (`returnsToAddress`).
 */
export function BackLink({ href, label, phoneOnly = false, returns = "parent" }: { href: string; label: string; phoneOnly?: boolean; returns?: BackReturn }) {
  return <Link data-back-link data-back-return={returns === "parent" ? undefined : returns} className={`page-back-link${phoneOnly ? " page-back-link--phone" : ""}`} href={href} onClick={event => followBack(event, href)}><AppIcon name="chevronLeft" /><span>{label}</span></Link>;
}
