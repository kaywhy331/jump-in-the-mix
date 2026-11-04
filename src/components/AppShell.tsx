"use client";

import Link from "next/link";
import { Fragment, useLayoutEffect, useRef } from "react";
import { Logo } from "@/components/Logo";
import { AccountControl, AccountNav, Nav } from "@/components/Nav";
import { AppearanceControl } from "@/components/Appearance";
import { logoutAction } from "@/lib/auth-actions";
import { QuickAddButton, QuickAddDialog } from "@/components/QuickAdd";
import { AppIcon } from "@/components/AppIcon";
import { formatDateTime, type DisplayFormatPreferences } from "@/lib/format";
import { INVITATIONS_PATH, invitationsLeftLabel } from "@/lib/invitation-labels";

export function AppShell({
  children,
  userName,
  billingAvailable,
  displayPreferences,
  invitationsLeft = null,
  impersonation
}: {
  children: React.ReactNode;
  userName: string;
  billingAvailable: boolean;
  displayPreferences: DisplayFormatPreferences;
  /** Personal invitations the owner can still send; null hides every invitation prompt. */
  invitationsLeft?: number | null;
  impersonation: {
    reference: string;
    targetName: string;
    targetEmail: string;
    reason: string;
    expiresAt: string;
  } | null;
}) {
  const mobileNav = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const nav = mobileNav.current;
    if (!nav) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty("--phone-nav-height", `${nav.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav, { box: "border-box" });
    return () => {
      observer.disconnect();
      root.style.removeProperty("--phone-nav-height");
    };
  }, []);

  const expiresLabel = impersonation
    ? formatDateTime(impersonation.expiresAt, displayPreferences)
    : null;

  const endImpersonationForm = (
    <form action="/api/admin/impersonation/end" method="post">
      <button className="button small danger" type="submit">End view-only session</button>
    </form>
  );

  const accountEntries = [
    { key: "account", content: <Link href="/account"><AppIcon name="profile" />My account</Link> },
    { key: "billing", content: <Link href="/account/billing" aria-label="Plan and billing"><AppIcon name="profile" /><span>Plan and billing{!billingAvailable && <small>Free during the beta</small>}</span></Link> },
    { key: "appearance", content: <AppearanceControl compact /> },
    ...(invitationsLeft ? [{ key: "invitations", content: <Link href={INVITATIONS_PATH}><AppIcon name="gift" />Invite people · {invitationsLeftLabel(invitationsLeft)}</Link> }] : []),
    { key: "sign-out", content: <form action={logoutAction} className="contact-tools-links"><button type="submit"><AppIcon name="arrowLeft" />Sign out</button></form> }
  ];

  return (
    <div className={impersonation ? "app-shell impersonating" : "app-shell"}>
      <a className="public-skip-link" href="#workspace-main">Skip to content</a>
      <aside className="sidebar">
        <Logo />
        {!impersonation && <QuickAddButton />}
        <Nav quickAdd={!impersonation} />
        {invitationsLeft && <Link className="invite-callout" href={INVITATIONS_PATH} aria-label={`Invite people: ${invitationsLeftLabel(invitationsLeft)}`}>
          <AppIcon name="gift" /><span><strong>{invitationsLeftLabel(invitationsLeft)}</strong><small>Share free access with people you know</small></span>
          <span className="invite-count" aria-hidden="true">{invitationsLeft}</span>
        </Link>}
        <div className="sidebar-footer account-sidebar-footer">
          <AccountNav />
          <div className="account-sidebar-actions">
            {impersonation ? endImpersonationForm : (
              <AccountControl userName={userName}>
                <div className="contact-tools-links account-menu">
                  {accountEntries.map(({ key, content }) => <Fragment key={key}>{content}</Fragment>)}
                </div>
              </AccountControl>
            )}
          </div>
        </div>
      </aside>
      <header className="mobile-app-header">
        <Logo />
        {impersonation ? endImpersonationForm : (
          <div className="mobile-header-actions"><Link className="button small mobile-profile-link" href="/more" aria-label="More">{userName.slice(0, 1).toUpperCase()}</Link></div>
        )}
      </header>
      {impersonation && (
        <section className="impersonation-banner" role="status" aria-live="polite">
          <div>
            <strong>View-only support session</strong>
            <span>Viewing {impersonation.targetName} ({impersonation.targetEmail}) · ends at {expiresLabel}</span>
            <small>Case {impersonation.reference}. Reason: {impersonation.reason}. Editing, deleting, imports, actions, and other browser mutations are blocked.</small>
          </div>
          {endImpersonationForm}
        </section>
      )}
      <main id="workspace-main" tabIndex={-1} className="app-main">{children}</main>
      <div ref={mobileNav} className="mobile-nav"><Nav quickAdd={!impersonation} /></div>
      {!impersonation && <QuickAddDialog timezone={displayPreferences.timeZone} locale={displayPreferences.locale} />}
    </div>
  );
}
