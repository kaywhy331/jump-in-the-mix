import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { confirmWaitlistAction } from "@/lib/waitlist-actions";

export const metadata: Metadata = { title: "Confirm your waitlist request", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ConfirmWaitlistPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <main className="auth-shell"><section className="auth-card"><Logo />
    <h1>Confirm your email</h1><p>Confirm your request to be included in our free-account invitation waves.</p>
    <p>If you previously left, confirming allows invitation emails again and starts a new place in the queue.</p>
    <form action={confirmWaitlistAction}><input type="hidden" name="token" value={token ?? ""} /><button className="button primary" type="submit">Confirm waitlist request</button></form>
  </section></main>;
}
