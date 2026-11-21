import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { getCurrentSession } from "@/lib/auth";
import { signedInHome } from "@/lib/signed-in-home";

export const metadata: Metadata = { title: "Account deleted" };

// A deletion ends every session, so a browser that is still signed in has an account: it goes to Today
// instead of a receipt for a deletion that did not happen (JITM-08 §2.39).
export default async function AccountDeletedPage() {
  if (await getCurrentSession().catch(() => null)) redirect(await signedInHome() ?? "/jumps");
  return (
    <AuthCard>
        <h1>Your Jump in the Mix account has been deleted.</h1>
        <p>You are signed out on every device.</p>
        <Link className="button primary" href="/">Return home</Link>
    </AuthCard>
  );
}
