import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="logo" aria-label="Jump in the Mix home">
      <span className="logo-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18 18 6M10 6h8v8"/><path d="M6 6v4M6 14v4h4M14 18h4v-4"/></svg></span>
      {!compact && <span>Jump in the Mix</span>}
    </Link>
  );
}
