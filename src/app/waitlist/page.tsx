import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { WaitlistForm } from "@/components/WaitlistForm";
import { getAdmissionPolicy } from "@/lib/admission";
import { PublicTrustLinks } from "@/components/PublicTrustLinks";

export const metadata: Metadata = { title: "Join the waitlist" };

export default async function WaitlistPage({ searchParams }: { searchParams: Promise<{ error?: string; submitted?: string; confirmed?: string }> }) {
  const params = await searchParams;
  const { collectionPaused } = await getAdmissionPolicy();
  return <main className="auth-shell"><section className="auth-card">
    <Logo />
    <div><p className="eyebrow">Free · By invitation</p><h1>Join the waitlist</h1>
    <p>Every 7 days, we invite up to 10 people: the 5 earliest confirmed signups, then 5 chosen at random from everyone else waiting.</p></div>
    {params.error && <Notice type="error">{params.error}</Notice>}
    {params.submitted && <Notice>Check your inbox. If your email needs confirmation, we’ve sent a link. Already confirmed? You’ll keep your place. Already invited? Use your invitation email.</Notice>}
    {params.confirmed ? <Notice>Your email is confirmed. If you’re still waiting for access, you’re eligible for the next wave. We’ll email your personal invitation when selected.</Notice> : collectionPaused ? <Notice>New waitlist requests are paused. Please try again later. Existing confirmation links still work.</Notice> : <WaitlistForm />}
    <p>Waves depend on available account capacity and may pause while we make room.</p>
    <p>Know a member? They can invite you through the Jump in the Mix System Mix. Each member gets five personal invitations.</p>
    <p>Have an invitation? Open the unique link in your email. Already a member? <Link href="/login">Sign in</Link>.</p>
    <p><Link href="/waitlist/leave">Leave the waitlist or stop invitation emails</Link>.</p>
    <Link href="/">Back to home</Link>
    <PublicTrustLinks />
  </section></main>;
}
