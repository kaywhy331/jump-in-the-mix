import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { WaitlistForm } from "@/components/WaitlistForm";
import { getAdmissionPolicy } from "@/lib/admission";
import { PublicTrustLinks } from "@/components/PublicTrustLinks";

export const metadata: Metadata = { title: "Join the waitlist" };

export default async function WaitlistPage({ searchParams }: { searchParams: Promise<{ error?: string; submitted?: string; confirmed?: string; scenario?: string }> }) {
  const params = await searchParams;
  const { collectionPaused } = await getAdmissionPolicy();
  return <main className="auth-shell"><section className="auth-card">
    <Logo />
    <div><h1>Join the waitlist</h1>
    <p>Request access with your email. Accounts are free, with no card to enter.</p></div>
    <ol><li>Join with your email.</li><li>Open the confirmation link in your inbox.</li><li>We email your invitation when access is available.</li></ol>
    {params.error && <Notice type="error">{params.error}</Notice>}
    {params.submitted && <Notice>Check your inbox. If your email needs confirmation, we’ve sent a link. Already confirmed? You’ll keep your place. Already invited? Use your invitation email. <Link href="/waitlist">Change email</Link>.</Notice>}
    {params.confirmed ? <Notice>Your email is confirmed. We’ll email you as soon as your spot is ready.</Notice> : collectionPaused ? <Notice>New waitlist requests are paused for a moment. Existing confirmation links still work. <Link href="/contact">Contact support</Link> for help; a reopening date is not yet available.</Notice> : <WaitlistForm scenarioId={params.scenario} />}
    <p>Have an invitation? Open the unique link in your email. Already a member? <Link href="/login">Sign in</Link>.</p>
    <p><Link href="/waitlist/leave">Leave the waitlist or stop invitation emails</Link>.</p>
    <Link href="/">Back to home</Link>
    <PublicTrustLinks />
  </section></main>;
}
