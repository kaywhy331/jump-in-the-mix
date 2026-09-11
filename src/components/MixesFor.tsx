import Link from "next/link";
import { PERSONAS } from "@/lib/persona-mixes";

// The same row on every public page; the page you are on is highlighted.
export function MixesFor({ current }: { current: "all" | string }) {
  return <nav className="mixes-for" aria-label="Mixes for">
    <span className="mixes-for-label">Mixes for:</span>
    <ul>
      <li><Link href="/" aria-current={current === "all" ? "page" : undefined}>All</Link></li>
      {PERSONAS.map(item => <li key={item.id}><Link href={`/for/${item.slug}`} aria-current={current === item.id ? "page" : undefined}>{item.navLabel}</Link></li>)}
    </ul>
  </nav>;
}
