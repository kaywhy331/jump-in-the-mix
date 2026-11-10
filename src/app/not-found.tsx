import type { Metadata } from "next";
import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";

// The page part of the title matches the H1 (JITM-10 §2.22).
export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return <section className="recovery-page"><div className="recovery-card">
    <span className="recovery-symbol"><AppIcon name="arrowLeft" /></span>
    <h1>Page not found</h1>
    <p>This link may have changed, or the item is no longer available.</p>
    <div className="page-actions"><Link className="button primary" href="/">Go to home</Link><Link className="button" href="/contact">Contact support</Link></div>
  </div></section>;
}
