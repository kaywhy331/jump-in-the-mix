import Link from "next/link";
import { Logo } from "@/components/Logo";
import { requirePlatformAdminIdentity } from "@/lib/auth";
import { logoutAction } from "@/lib/auth-actions";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requirePlatformAdminIdentity();
  return <div className="staff-shell">
    <header className="public-header"><Logo /><nav className="page-actions" aria-label="Staff account">
      {user.memberships.length > 0 && <Link href="/jumps">Your account</Link>}
      <Link href="/account/admin-mfa">Security</Link>
      <form action={logoutAction}><button className="button" type="submit">Sign out</button></form>
    </nav></header>
    <main id="main-content" className="container">{children}</main>
  </div>;
}
