import Link from "next/link";
import { Logo } from "@/components/Logo";
import { AccountNav, Nav } from "@/components/Nav";
import { AppearanceControl } from "@/components/Appearance";
import { logoutAction } from "@/lib/auth-actions";
import { QuickAddButton, QuickAddDialog } from "@/components/QuickAdd";
import { Sheet } from "@/components/Sheet";
import { AppIcon } from "@/components/AppIcon";
import { formatDateTime, type DisplayFormatPreferences } from "@/lib/format";
import { INVITATIONS_PATH, invitationsLeftLabel } from "@/lib/invitation-labels";

export function AppShell({
  children,
  userName,
  displayPreferences,
  invitationsLeft = null,
  impersonation
}: {
  children: React.ReactNode;
  userName: string;
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
  const expiresLabel = impersonation
    ? formatDateTime(impersonation.expiresAt, displayPreferences)
    : null;

  const endImpersonationForm = (
    <form action="/api/admin/impersonation/end" method="post">
      <button className="button small danger" type="submit">End view-only session</button>
    </form>
  );

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
          <AppearanceControl compact />
          <span className="user-label">{impersonation ? `Viewing as ${userName}` : `Signed in as ${userName}`}</span>
          <div className="account-sidebar-actions">
            {impersonation ? endImpersonationForm : (
              <Sheet
                trigger={<button className="button small" type="button"><AppIcon name="profile" />Profile</button>}
                title="Profile and settings"
                description={`Signed in as ${userName}`}
                className="profile-sheet"
              >
                <nav className="contact-tools-links" aria-label="Profile and settings">
                  <Link href="/account"><AppIcon name="profile" />My account</Link>
                  <Link href="/settings"><AppIcon name="settings" />Settings</Link>
                  <Link href="/templates"><AppIcon name="import" />Ready-made Mixes</Link>
                  {invitationsLeft && <Link href={INVITATIONS_PATH}><AppIcon name="gift" />Invite people · {invitationsLeftLabel(invitationsLeft)}</Link>}
                  <Link href="/help"><AppIcon name="help" />Help</Link>
                </nav>
                <form action={logoutAction} className="contact-tools-links"><button type="submit"><AppIcon name="arrowLeft" />Sign out</button></form>
              </Sheet>
            )}
          </div>
        </div>
      </aside>
      <header className="mobile-app-header">
        <Logo />
        {impersonation ? endImpersonationForm : (
          <div className="mobile-header-actions">{invitationsLeft && <Link className="mobile-invite-link" href={INVITATIONS_PATH} aria-label={`Invite people: ${invitationsLeftLabel(invitationsLeft)}`}><AppIcon name="gift" /><span className="invite-count" aria-hidden="true">{invitationsLeft}</span></Link>}<Link className="button small mobile-profile-link" href="/more" aria-label="More">{userName.slice(0, 1).toUpperCase()}</Link></div>
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
      <div className="mobile-nav"><Nav moreBadge={invitationsLeft} quickAdd={!impersonation} /></div>
      {!impersonation && <QuickAddDialog timezone={displayPreferences.timeZone} />}
    </div>
  );
}
