import Link from "next/link";
import { AppIcon } from "@/components/AppIcon";

export default function NotFound() {
  return <section className="recovery-page"><div className="recovery-card">
    <span className="recovery-symbol"><AppIcon name="arrowLeft" /></span>
    <p className="eyebrow">Page not found</p><h1>Let’s get you back on track.</h1>
    <p>This link may have changed, or the item is no longer available.</p>
    <div className="page-actions"><Link className="button primary" href="/jumps">Go to Today</Link><Link className="button" href="/help">Get help</Link></div>
  </div></section>;
}
