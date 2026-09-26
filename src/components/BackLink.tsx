import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";

/** Phone-familiar back control: a chevron plus the parent screen's name. */
export function BackLink({ href, label, phoneOnly = false }: { href: string; label: string; phoneOnly?: boolean }) {
  return <Link className={`page-back-link${phoneOnly ? " page-back-link--phone" : ""}`} href={href}><AppIcon name="chevronLeft" /><span>{label}</span></Link>;
}
