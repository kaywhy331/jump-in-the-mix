import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { PublicTrustLinks } from "@/components/PublicTrustLinks";
import { PUBLIC_POLICY_DATE, publicTrust, type PublicTrust } from "@/lib/public-trust";

export function PublicDocument({ title, children }: { title: string; children: (details: PublicTrust) => ReactNode }) {
  const details = publicTrust();
  if (!details) notFound();
  return <div className="public-page">
    <a className="public-skip-link" href="#main-content">Skip to content</a>
    <header className="public-header"><Logo /><Link className="button" href="/login">Sign in</Link></header>
    <main id="main-content" tabIndex={-1} className="public-document">
      <Link href="/">Back to home</Link>
      <h1>{title}</h1>
      <p className="public-document-date">Effective <time dateTime={PUBLIC_POLICY_DATE}>{PUBLIC_POLICY_DATE}</time></p>
      {children(details)}
    </main>
    <footer className="public-footer"><p>Jump in the Mix is operated by {details.operatorName}.</p><PublicTrustLinks /></footer>
  </div>;
}
