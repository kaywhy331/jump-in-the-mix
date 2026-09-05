import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Nav } from "@/components/Nav";
import { logoutAction } from "@/lib/auth-actions";
import { QuickAddButton, QuickAddDialog } from "@/components/QuickAdd";
import { Sheet } from "@/components/Sheet";
import { formatDateTime, type DisplayFormatPreferences } from "@/lib/format";

export function AppShell({
  children,
  userName,
  displayPreferences,
  impersonation
}: {
  children: React.ReactNode;
  userName: string;
  displayPreferences: DisplayFormatPreferences;
  impersonation: {
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
      <aside className="sidebar">
        <Logo />
        <Nav />
        {!impersonation && <QuickAddButton />}
        <div className="sidebar-footer account-sidebar-footer">
          <span className="user-label">{impersonation ? `Viewing as ${userName}` : `Signed in as ${userName}`}</span>
          <div className="account-sidebar-actions">
            {impersonation ? endImpersonationForm : (
              <Sheet
                trigger={<button className="button small" type="button">Profile</button>}
                title="Profile and settings"
                description={`Signed in as ${userName}`}
                className="profile-sheet"
              >
                <nav className="sheet-link-list" aria-label="Profile and settings">
                  <Link className="button" href="/account">My Account</Link>
                  <Link className="button" href="/settings">Settings</Link>
                  <Link className="button" href="/templates">Ready-made plans</Link>
                  <Link className="button" href="/help">Help</Link>
                </nav>
                <form action={logoutAction}><button className="button danger" type="submit">Sign out</button></form>
              </Sheet>
            )}
          </div>
        </div>
      </aside>
      <header className="mobile-app-header">
        <Logo />
        {impersonation ? endImpersonationForm : (
          <Link className="button small mobile-profile-link" href="/more" aria-label={`Open profile menu for ${userName}`}>{userName.slice(0, 1).toUpperCase()}</Link>
        )}
      </header>
      {impersonation && (
        <section className="impersonation-banner" role="status" aria-live="polite">
          <div>
            <strong>View-only support session</strong>
            <span>Viewing {impersonation.targetName} ({impersonation.targetEmail}) · ends at {expiresLabel}</span>
            <small>Reason: {impersonation.reason}. Editing, deleting, imports, actions, and other browser mutations are blocked.</small>
          </div>
          {endImpersonationForm}
        </section>
      )}
      <main className="app-main">{children}</main>
      <div className="mobile-nav"><Nav /></div>
      {!impersonation && <QuickAddDialog />}
    </div>
  );
}
