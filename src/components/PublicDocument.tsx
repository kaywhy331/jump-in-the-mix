import { PublicContents } from "@/components/PublicContents";
import { AppearanceControl } from "@/components/Appearance";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { PublicTrustLinks } from "@/components/PublicTrustLinks";
import { PUBLIC_POLICY_DATE, publicTrust, type PublicTrust } from "@/lib/public-trust";

/** A public policy page. `effectiveDate` (YYYY-MM-DD) is for a page first published after the shared policy date. */
export function PublicDocument({ title, effectiveDate = PUBLIC_POLICY_DATE, children }: { title: string; effectiveDate?: string; children: (details: PublicTrust) => ReactNode }) {
  const details = publicTrust();
  if (!details) notFound();
  return <div className="public-page">
    <a className="public-skip-link" href="#main-content">Skip to content</a>
    <header className="public-header"><Logo /><div className="public-header-actions"><AppearanceControl compact labelHidden /><Link className="button" href="/login">Sign in</Link></div></header>
    <main id="main-content" tabIndex={-1} className="public-document">
      <Link href="/">Back to home</Link>
      <h1>{title}</h1>
      <p className="public-document-date">Effective <time dateTime={effectiveDate}>{effectiveDate}</time></p>
      <PublicContents />
      {children(details)}
    </main>
    <footer className="public-footer"><p>Jump in the Mix is operated by {details.operatorName}.</p><PublicTrustLinks /></footer>
  </div>;
}
