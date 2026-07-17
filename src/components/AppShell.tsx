import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Nav } from "@/components/Nav";
import { ReferralShareButton } from "@/components/ReferralShareButton";
import { logoutAction } from "@/lib/auth-actions";

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
        <Logo />
        <div className="workspace-chip">
          <span>{workspaceName}</span>
          <small>{planTier} plan</small>
        </div>
        <Nav />
        <div className="sidebar-footer account-sidebar-footer">
          <span className="user-label">{impersonation ? `Viewing as ${userName}` : `Signed in as ${userName}`}</span>
          <div className="account-sidebar-actions">
            {impersonation ? endImpersonationForm : (
              <>
                {referralMessage && <ReferralShareButton message={referralMessage} compact className="referral-sidebar-share" />}
                <Link className="text-button" href="/account">My Account</Link>
                {isPlatformAdmin && <Link className="text-button" href="/admin/users">Admin</Link>}
                <form action={logoutAction}><button className="text-button" type="submit">Sign out</button></form>
              </>
            )}
          </div>
        </div>
      </aside>
      <header className="mobile-app-header">
        <Logo />
        {impersonation ? endImpersonationForm : (
          <div className="mobile-account-actions">
            {referralMessage && <ReferralShareButton message={referralMessage} compact />}
            {isPlatformAdmin && <Link className="button small" href="/admin/users">Admin</Link>}
            <Link className="button small" href="/account" aria-label={`Open My Account for ${userName}`}>My Account</Link>
          </div>
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
    </div>
  );
}
