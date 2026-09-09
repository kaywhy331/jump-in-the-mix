import Link from "next/link";
import { publicTrust } from "@/lib/public-trust";

export function PublicTrustLinks() {
  if (!publicTrust()) return null;
  return <nav className="public-trust-links" aria-label="Policies and support"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/contact">Contact &amp; support</Link></nav>;
}
