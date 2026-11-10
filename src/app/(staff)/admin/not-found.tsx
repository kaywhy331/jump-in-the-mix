import Link from "next/link";
import { headers } from "next/headers";
import { requirePlatformAdmin } from "@/lib/auth";
import { activeAdminArea, firstAdminDestination, safeAdminReturnTo } from "@/lib/admin-navigation";

/** A missing staff record stays inside the admin shell: a staff H1 and a way back to the list it belongs to. */
export default async function AdminNotFound() {
  const [{ permissions }, request] = await Promise.all([requirePlatformAdmin(), headers()]);
  const fallback = firstAdminDestination(permissions);
  const path = safeAdminReturnTo(request.get("x-jitm-admin-return"), fallback).split("?")[0].split("#")[0];
  const list = [activeAdminArea(path, permissions), activeAdminArea(fallback, permissions)].find(area => area && area.href !== path);
  return <div className="page">
    <header className="page-header">
      <div><h1>This record isn’t available</h1><p>It may have been removed, or the link may be incomplete. Nothing was changed.</p></div>
      {list && <div className="page-actions"><Link className="button" href={list.href}>Back to {list.label}</Link></div>}
    </header>
  </div>;
}
