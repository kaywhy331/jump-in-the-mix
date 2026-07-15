import Link from "next/link";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="logo" aria-label="Jump in the Mix home">
      <span className="logo-mark" aria-hidden="true">↗</span>
      {!compact && <span>Jump in the Mix</span>}
    </Link>
  );
}
