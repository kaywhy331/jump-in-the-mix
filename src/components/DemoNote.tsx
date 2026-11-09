import Link from "next/link";

// Keep the full explanation at one destination for every public demo CTA.
export function DemoNote() {
  return <p className="hero-note"><Link className="text-link" href="/faq#demo">The demo sends nothing.</Link></p>;
}
