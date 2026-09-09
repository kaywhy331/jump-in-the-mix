import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Notice } from "@/components/Notice";
import { requestStopInvitationsAction, stopInvitationsAction } from "@/lib/invitation-preference-actions";

export const metadata: Metadata = { title: "Manage invitation emails", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function LeaveWaitlistPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string; submitted?: string; stopped?: string }> }) {
  const params = await searchParams;
  const token = params.token && /^[A-Za-z0-9_-]{43}$/.test(params.token) ? params.token : null;
  return <main className="auth-shell"><section className="auth-card"><Logo />
    <h1>{params.stopped ? "Invitation emails stopped" : "Leave the waitlist"}</h1>
    {params.error && <Notice type="error">{params.error}</Notice>}
    {params.submitted && <Notice>If this email has a waitlist request or an unused invitation, we’ve sent a link to confirm your choice. Already stopped? You don’t need to do anything else.</Notice>}
    {params.stopped ? <>
      <Notice type="success">You’re off the waitlist. Your unused invitations have been canceled, and members cannot send you new invitations.</Notice>
      <p>An email already being sent may still arrive. Its invitation link will no longer work. If you already have an account, you can keep using it.</p>
      <p>Changed your mind? <Link href="/waitlist">Join and confirm your email again</Link> to start a new place in the queue.</p>
    </> : token ? <>
      <p>Stop invitation emails from Jump in the Mix, leave the waitlist, and cancel any unused access links sent to this email. This does not delete an existing account.</p>
      <form action={stopInvitationsAction}><input type="hidden" name="token" value={token} /><button className="button primary" type="submit">Leave waitlist and stop invitations</button></form>
    </> : <>
      <p>We’ll email a link so you can confirm that you want to leave and stop invitation emails.</p>
      <form action={requestStopInvitationsAction} className="form-stack">
        <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" maxLength={254} required /></div>
        <button className="button primary" type="submit">Email me a confirmation link</button>
      </form>
    </>}
    <div className="auth-footer"><Link className="button" href="/">Back to home</Link></div>
  </section></main>;
}
