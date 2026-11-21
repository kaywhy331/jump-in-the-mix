import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { confirmWaitlistAction } from "@/lib/waitlist-actions";

export const metadata: Metadata = { title: "Confirm your waitlist request", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ConfirmWaitlistPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  // Without a token there is nothing to confirm: name that state and offer a new request instead of a
  // confirm button that cannot work (JITM-08 §2.39).
  if (!token?.trim()) return <AuthCard>
    <h1>This confirmation link is incomplete</h1><p>Open the full link from your confirmation email, or enter your email again to get a new one.</p>
    <Link className="button primary" href="/waitlist">Join the waitlist</Link>
  </AuthCard>;
  return <AuthCard>
    <h1>Confirm your email</h1><p>Confirm your email to join the waitlist. We email invitations in small groups as space opens, so we can’t promise a date.</p>
    <p>If you previously left, confirming allows invitation emails again and adds you to the waitlist as a new request.</p>
    <form action={confirmWaitlistAction}><input type="hidden" name="token" value={token} /><button className="button primary" type="submit">Confirm waitlist request</button></form>
  </AuthCard>;
}
