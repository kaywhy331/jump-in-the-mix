import { ActionForm } from "@/components/ActionForm";
import { SupportContact, SupportReportFields } from "@/components/SupportReportFields";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice } from "@/components/Notice";
import { UrlErrorNotice } from "@/components/UrlErrorNotice";
import { SupportFaq } from "@/components/SupportFaq";
import { requireWorkspace } from "@/lib/auth";
import { env } from "@/lib/env";
import { createSupportTicketFormAction } from "@/lib/support-actions";
import { SUPPORT_RETENTION_NOTICE } from "@/lib/data-retention-policy";
import { BackLink } from "@/components/BackLink";

export const metadata: Metadata = { title: "Help" };

type SearchParams = { error?: string; at?: string; sig?: string };

function SelfHostedHelp() {
  const email = env.emailReplyTo.trim();
  return (
    <section className="support-contact-grid" id="contact-support">
      <section className="card support-contact-card">
        <div className="card-header"><div><h2>Self-hosted help</h2><p>The operator of this installation manages access, email, updates, and backups.</p></div></div>
        <div className="form-stack">
          <div><strong>Locked out?</strong><p>Ask the operator to run <code>npm run pilot:reset-password -- your@email.com</code> on the server. The command creates a short-lived recovery link without requiring email delivery.</p></div>
          <div><strong>Something is not working?</strong><p>Run <code>npm run doctor</code>, then check the local logs with <code>npm run pilot:logs</code>. Never paste customer data, passwords, keys, or session tokens into a public report.</p></div>
          <div className="page-actions">
            <a className="button primary" href="https://github.com/kaywhy331/jump-in-the-mix/blob/main/docs/PILOT_RUNBOOK.md" target="_blank" rel="noreferrer">Open operator guide</a>
            <a className="button" href="https://github.com/kaywhy331/jump-in-the-mix/issues/new/choose" target="_blank" rel="noreferrer">Report a sanitized issue</a>
            {email && <a className="button" href={`mailto:${email}`}>Email the operator</a>}
          </div>
        </div>
      </section>
    </section>
  );
}

export default async function HelpPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [query, context] = await Promise.all([searchParams, requireWorkspace()]);
  const { session, impersonation } = context;

  if (env.pilotMode) {
    return (
      <div className="page page--content help-page">
        <BackLink href="/more" label="More" phoneOnly /><header className="page-header"><div><h1>Help</h1><p>Plain-language answers plus operator steps for this self-hosted installation.</p></div></header>
        <div className="page-actions"><Link className="button" href="/onboarding">Getting started</Link><Link className="button" href="/journey">Review my Journey</Link></div>
        <SupportFaq />
        <SelfHostedHelp />
      </div>
    );
  }

  return (
    <div className="page page--content help-page">
      <BackLink href="/more" label="More" phoneOnly /><header className="page-header">
        <div><h1>Help</h1><p>Find a quick answer or send a private message to the support team.</p></div>
        <div className="page-actions"><a className="button primary" href="#contact-support">Contact support</a><Link className="button" href="/account/tickets">My requests</Link></div>
      </header>

      <UrlErrorNotice params={query} viewer={session} />
      {impersonation && <Notice type="info">This view is read-only. End the support session before submitting or replying.</Notice>}

      <div className="page-actions"><Link className="button" href="/onboarding">Getting started</Link><Link className="button" href="/journey">Review my Journey</Link></div>
      <SupportFaq />

      <SupportContact initiallyOpen={Boolean(query.error)}>
        <ActionForm protect action={createSupportTicketFormAction} className="form-stack">
          <SupportReportFields disabled={Boolean(impersonation)} />
          <details><summary>Replies and privacy</summary><p>Support is best effort; there is no guaranteed reply time. Check this conversation for responses. If you cannot sign in, use <Link href="/contact">public contact support</Link>.</p><p>{SUPPORT_RETENTION_NOTICE}</p></details>
        </ActionForm>
      </SupportContact>
    </div>
  );
}
