import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { requestEmailChangeAction } from "@/lib/account-email-actions";
import { requireWorkspace } from "@/lib/auth";

export const metadata: Metadata = { title: "Change account email" };

type SearchParams = { error?: string; requested?: string; email?: string; devToken?: string };

export default async function ChangeAccountEmailPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [query, { user, impersonation }] = await Promise.all([searchParams, requireWorkspace()]);
  if (impersonation) return <div className="page"><Notice type="info">Email settings are private during a view-only support session.</Notice></div>;
  const devUrl = query.devToken ? `/change-email?token=${encodeURIComponent(query.devToken)}` : null;
  return (
    <div className="page account-email-page">
      {query.error && <Notice type="error">{query.error}</Notice>}
      {query.requested && <Notice type="success">A one-time confirmation link was sent to {query.email}. The current email remains active until confirmation.</Notice>}
      {devUrl && process.env.NODE_ENV !== "production" && <Notice type="info">Local confirmation preview: <Link href={devUrl}>confirm the new email</Link>.</Notice>}
      <header className="page-header"><div><h1>Change account email</h1><p>The new address must receive and confirm a one-time link before any account data changes.</p></div><Link className="button" href="/account?section=security">Back to Security</Link></header>
      <section className="card"><dl className="account-definition-list"><div><dt>Current email</dt><dd>{user.email}</dd></div><div><dt>Verification</dt><dd>{user.emailVerifiedAt ? "Verified" : "Pending"}</dd></div></dl></section>
      <section className="card"><form action={requestEmailChangeAction} className="form-stack"><label className="field"><span>New email</span><input name="email" type="email" autoComplete="email" required /></label><label className="field"><span>Current password</span><input name="currentPassword" type="password" autoComplete="current-password" required /></label><button className="button primary" type="submit">Send confirmation link</button></form></section>
    </div>
  );
}
