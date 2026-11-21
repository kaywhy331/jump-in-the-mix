import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { ADMIN_PERMISSIONS, isAdminPermission } from "@/lib/admin-permissions";
import { firstAdminDestination, safeAdminReturnTo, activeAdminArea } from "@/lib/admin-navigation";
const PAGE_NAME = "This area needs another permission";
export const metadata = { title: PAGE_NAME };
export default async function AccessDeniedPage({ searchParams }: { searchParams: Promise<{ capability?: string; returnTo?: string }> }) {
  const [{ permissions }, params] = await Promise.all([requirePlatformAdmin(), searchParams]);
  const capability = params.capability && isAdminPermission(params.capability) ? ADMIN_PERMISSIONS[params.capability] : "Access to this area";
  const fallback = firstAdminDestination(permissions);
  // A denied destination must never become its own return target.
  const candidate = safeAdminReturnTo(params.returnTo, fallback);
  const returnTo = activeAdminArea(candidate.split("?")[0].split("#")[0], permissions) ? candidate : fallback;
  return <div className="page"><h1>{PAGE_NAME}</h1><p>Required capability: <strong>{capability}</strong>.</p><p>Ask an owner to review your staff permissions. Your current access is unchanged.</p><Link className="button" href={returnTo}>Return to your workspace</Link></div>;
}
