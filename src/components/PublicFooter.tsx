import Link from "next/link";
import { Logo } from "@/components/Logo";

// The footer shared by the homepage, the profession pages, the FAQ page and the template and
// feature pages. Ordinary links, so every public page is reachable without a header menu.
export function PublicFooter() {
  return <footer className="public-footer"><Logo /><p>A little follow-through goes a long way.</p><nav aria-label="Footer navigation"><Link href="/#how-it-works">How it works</Link><Link href="/follow-up-templates">Follow-up templates</Link><Link href="/features/follow-up-reminders">Follow-up reminders</Link><Link href="/faq">Questions</Link><Link href="/faq#your-data">Your data</Link><Link href="/login">Sign in</Link></nav><nav className="public-trust-links" aria-label="Policies and support"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/contact">Contact &amp; support</Link></nav></footer>;
}
