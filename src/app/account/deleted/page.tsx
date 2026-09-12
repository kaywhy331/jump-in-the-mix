import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Account deleted" };

export default function AccountDeletedPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Your Jump in the Mix account has been deleted.</h1>
        <p>You are signed out on every device. Any provider revocation that could not finish immediately will be retried without restoring your account data.</p>
        <Link className="button primary" href="/">Return home</Link>
      </section>
    </main>
  );
}
