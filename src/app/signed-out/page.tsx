import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { SignedOutCleanup } from "@/components/SignedOutCleanup";

export default async function SignedOutPage({ searchParams }: { searchParams: Promise<{ everywhere?: string }> }) {
  if (await getCurrentSession()) redirect("/jumps");
  const { everywhere } = await searchParams;
  return <main className="auth-shell"><SignedOutCleanup /><section className="auth-card"><h1>You’re signed out</h1><p>{everywhere ? "All your sessions have been signed out." : "Your session on this browser has ended."}</p><a className="button primary" href="/login">Sign in</a><a className="button" href="/">Back to home</a></section></main>;
}
