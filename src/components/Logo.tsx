import Link from "next/link";
import Image from "next/image";
import brandLogo from "../../public/brand-logo.png";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="logo" aria-label="Jump in the Mix home">
      <span className="logo-mark" aria-hidden="true"><Image src={brandLogo} alt="" loading="eager" unoptimized /></span>
      {!compact && <span>Jump in the Mix</span>}
    </Link>
  );
}
