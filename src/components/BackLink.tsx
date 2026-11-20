"use client";

import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";
import { followBack } from "@/lib/back-navigation";

/**
 * Phone-familiar back control: a chevron plus the parent screen's name. Where Back returns to the parent it goes back,
 * with the parent's scroll; it is the visible equivalent of the back swipe (JITM-08 §2.46, JITM-10 §2.26).
 */
export function BackLink({ href, label, phoneOnly = false }: { href: string; label: string; phoneOnly?: boolean }) {
  return <Link data-back-link className={`page-back-link${phoneOnly ? " page-back-link--phone" : ""}`} href={href} onClick={event => followBack(event, href)}><AppIcon name="chevronLeft" /><span>{label}</span></Link>;
}
