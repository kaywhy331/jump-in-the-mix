import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { Logo } from "@/components/Logo";
import { consumeMagicLinkAction } from "@/lib/auth-actions";
import { customerReturnPath } from "@/lib/customer-return-path";
import { magicLinkCookieName } from "@/lib/magic-link";

// No index, no store (a dynamic page is sent with Cache-Control: no-store). The token is never in this
// page's address: it waits in an HttpOnly cookie scoped to /auth/magic. The referrer policy is
// "same-origin" rather than "no-referrer" because a native form post from a no-referrer page carries
// Origin: null, which the origin check in src/proxy.ts refuses, so a tap before the scripts load would fail.
export const metadata: Metadata = { title: "Continue signing in", robots: { index: false, follow: false }, referrer: "same-origin" };
export const dynamic = "force-dynamic";

export default async function MagicLinkPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const [params, store] = await Promise.all([searchParams, cookies()]);
  const ready = Boolean(store.get(magicLinkCookieName())?.value);
  const next = customerReturnPath(params.next);
  return <main className="auth-shell"><section className="auth-card"><Logo />
    {ready ? <>
      <h1>Continue signing in</h1>
      <p>Your sign-in link is ready. Continue to sign in to Jump in the Mix on this device.</p>
      <form action={consumeMagicLinkAction} className="form-stack">
        {next && <input type="hidden" name="next" value={next} />}
        <FormSubmitButton label="Continue signing in" pendingLabel="Signing in…" />
      </form>
    </> : <>
      <h1>Open your sign-in link again</h1>
      <p>This sign-in link has expired or was opened in a different browser. Open the link from your latest email on this device, or request a new one.</p>
      <Link className="button primary" href="/login">Back to sign in</Link>
    </>}
  </section></main>;
}
