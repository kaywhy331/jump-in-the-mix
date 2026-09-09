import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
export const metadata = { title: "Staff permission required" };
export default async function AccessDeniedPage() {
  await requirePlatformAdmin();
  return <div className="page"><h1>This area needs another permission</h1><p>Your staff account does not have access to this action. Ask an owner to review your permissions.</p><Link href="/admin">Back to administration</Link></div>;
}
