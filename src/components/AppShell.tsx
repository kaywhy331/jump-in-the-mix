import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Nav } from "@/components/Nav";
import { ReferralShareButton } from "@/components/ReferralShareButton";
import { logoutAction } from "@/lib/auth-actions";
import { QuickAddButton, QuickAddDialog } from "@/components/QuickAdd";

export function AppShell({
  children,
  userName,
  workspaceName,
  planTier,
  isPlatformAdmin,
  referralMessage,
  impersonation
}: {
  children: React.ReactNode;
  userName: string;
  workspaceName: string;
  planTier: string;
  isPlatformAdmin: boolean;
  referralMessage: string | null;
  impersonation: {
    targetName: string;
    targetEmail: string;
    reason: string;
    expiresAt: string;
  } | null;
}) {
  const expiresLabel = impersonation
    ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(impersonation.expiresAt))
    : null;

  const endImpersonationForm = (
    <form action="/api/admin/impersonation/end" method="post">
      <button className="button small danger" type="submit">End view-only session</button>
    </form>
  );

  return (
    <div className={impersonation ? "app-shell impersonating" : "app-shell"}>
      <aside className="sidebar">
        <span className="mobile-product-mark" aria-hidden="true">J</span>
        <div className="workspace-chip">
          <span>{workspaceName}</span>
          <small>{planTier} plan</small>
        </div>
        <Nav />
        {!impersonation && <QuickAddButton />}
        <div className="sidebar-footer account-sidebar-footer">
          <span className="user-label">{impersonation ? `Viewing as ${userName}` : `Signed in as ${userName}`}</span>
          <div className="account-sidebar-actions">
            {impersonation ? endImpersonationForm : (
              <details className="profile-menu">
                <summary className="button small">Profile &amp; workspace</summary>
                <div className="profile-menu-panel">
                <Link href="/account">My Account</Link>
                <Link href="/settings">Settings</Link>
                <Link href="/templates">Mix Templates</Link>
                <Link href="/help">Help &amp; Support</Link>
                {referralMessage && <ReferralShareButton message={referralMessage} compact className="referral-sidebar-share" />}
                {isPlatformAdmin && <Link href="/admin">Admin</Link>}
                <form action={logoutAction}><button className="text-button danger-text" type="submit">Sign out</button></form>
                </div>
              </details>
            )}
          </div>
        </div>
      </aside>
      <header className="mobile-app-header">
        <Logo />
        {impersonation ? endImpersonationForm : (
          <Link className="button small mobile-profile-link" href="/more" aria-label={`Open profile and workspace menu for ${userName}`}>{userName.slice(0, 1).toUpperCase()}</Link>
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
