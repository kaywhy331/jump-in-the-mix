import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="logo" aria-label="Jump in the Mix home">
      <span className="logo-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 5.5h8v10a4 4 0 0 1-8 0"/><path d="M11.5 18.5v-13l4.25 5 4.25-5v13"/></svg></span>
      {!compact && <span>Jump in the Mix</span>}
    </Link>
  );
}
