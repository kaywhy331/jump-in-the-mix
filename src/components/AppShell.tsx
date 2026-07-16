import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Nav } from "@/components/Nav";
import { logoutAction } from "@/lib/auth-actions";

export function AppShell({
  children,
  userName,
  workspaceName,
  planTier
}: {
  children: React.ReactNode;
  userName: string;
  workspaceName: string;
  planTier: string;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <div className="workspace-chip">
          <span>{workspaceName}</span>
          <small>{planTier} plan</small>
        </div>
        <Nav />
        <div className="sidebar-footer account-sidebar-footer">
          <span className="user-label">Signed in as {userName}</span>
          <div className="account-sidebar-actions">
            <Link className="text-button" href="/account">My Account</Link>
            <form action={logoutAction}><button className="text-button" type="submit">Sign out</button></form>
          </div>
        </div>
      </aside>
      <header className="mobile-app-header">
        <Logo />
        <Link className="button small" href="/account" aria-label={`Open My Account for ${userName}`}>My Account</Link>
      </header>
      <main className="app-main">{children}</main>
      <div className="mobile-nav"><Nav /></div>
    </div>
  );
}
