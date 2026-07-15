import { Logo } from "@/components/Logo";
import { Nav } from "@/components/Nav";
import { logoutAction } from "@/lib/actions";

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
        <form action={logoutAction} className="sidebar-footer">
          <span className="user-label">Signed in as {userName}</span>
          <button className="text-button" type="submit">Sign out</button>
        </form>
      </aside>
      <main className="app-main">{children}</main>
      <div className="mobile-nav"><Nav /></div>
    </div>
  );
}
