import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { UserMfaPanel } from "@/components/UserMfaPanel";
import { logoutAction } from "@/lib/auth-actions";
import { getPendingUserMfaSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Verify sign-in" };

export default async function UserMfaVerificationPage() {
  const pending = await getPendingUserMfaSession();
  if (!pending) redirect("/login");
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Logo />
        <UserMfaPanel mode="verify" />
        <form action={logoutAction}><button className="text-button" type="submit">Cancel and sign out</button></form>
      </section>
    </main>
  );
}
