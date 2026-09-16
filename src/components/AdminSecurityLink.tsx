"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { safeAdminReturnTo } from "@/lib/admin-navigation";
export function AdminSecurityLink({ fallback }: { fallback: string }) {
  const pathname = usePathname(), query = useSearchParams();
  const returnTo = safeAdminReturnTo(pathname.startsWith("/admin") ? `${pathname}${query.size ? `?${query}` : ""}` : query.get("returnTo"), fallback);
  return <Link href={`/account/admin-mfa?returnTo=${encodeURIComponent(returnTo)}`}>Security</Link>;
}
