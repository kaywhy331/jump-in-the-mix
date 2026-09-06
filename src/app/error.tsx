"use client";

import Link from "next/link";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <section className="recovery-page"><div className="recovery-card">
    <p className="eyebrow">Something went wrong</p><h1>We couldn’t open this page.</h1>
    <p>Try loading it again. If the problem continues, we’re here to help.</p>
    <div className="page-actions"><button className="button primary" type="button" onClick={retry}>Try again</button><Link className="button" href="/help">Get help</Link></div>
  </div></section>;
}
