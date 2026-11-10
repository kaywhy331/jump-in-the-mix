"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeAdminArea } from "@/lib/admin-navigation";
import { ADMIN_PERMISSIONS, type AdminPermission } from "@/lib/admin-permissions";

/**
 * The boundary can't read the staff member's permissions. It only names the list this page belongs to, or Overview,
 * and the destination page runs its own permission check.
 */
const EVERY_AREA = Object.keys(ADMIN_PERMISSIONS) as AdminPermission[];

export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const pathname = usePathname();
  const next = [activeAdminArea(pathname, EVERY_AREA), activeAdminArea("/admin", EVERY_AREA)].find(area => area && area.href !== pathname);
  return <div className="page">
    <header className="page-header">
      <div><h1>This staff page didn’t load</h1><p>Try again. If it keeps happening, tell an owner which page you were on{error.digest ? <> and this reference: <code>{error.digest}</code></> : null}.</p></div>
      <div className="page-actions"><button className="button primary" type="button" onClick={retry}>Try again</button>{next && <Link className="button" href={next.href}>Back to {next.label}</Link>}</div>
    </header>
  </div>;
}
