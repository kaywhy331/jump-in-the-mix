import { AdminSecurityLink } from "@/components/AdminSecurityLink";
import { firstAdminDestination } from "@/lib/admin-navigation";
import { AdminDraftProvider } from "@/components/AdminDraftProvider";
import { adminBrowserScope } from "@/lib/admin-browser-scope";
import { env } from "@/lib/env";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { requirePlatformAdminIdentity } from "@/lib/auth";
import { logoutAction } from "@/lib/auth-actions";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { user, session, staff, permissions } = await requirePlatformAdminIdentity();
  const scope = adminBrowserScope(session.id);
  const hostname = new URL(env.appUrl).hostname;
  const environment = env.privateTestMode || hostname.includes("-test.") ? "Test environment" : ["localhost", "127.0.0.1"].includes(hostname) ? "Local development" : hostname;
  return <AdminDraftProvider key={scope} scope={scope}><div className="staff-shell">
    <header className="public-header"><Logo /><div className="admin-operator"><strong>{user.name} · {staff.role.toLowerCase()}</strong><small>{environment}</small></div><nav className="page-actions" aria-label="Staff account">
      {user.memberships.length > 0 && <Link href="/jumps">Your account</Link>}
      <AdminSecurityLink fallback={firstAdminDestination(permissions)} />
      <form action={logoutAction}><button className="button" type="submit">Sign out</button></form>
    </nav></header>
    <main id="main-content" className="container">{children}</main>
  </div></AdminDraftProvider>;
}
