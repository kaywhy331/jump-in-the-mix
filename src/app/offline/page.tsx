import Link from "next/link";

export default function OfflinePage() {
  return <main className="auth-shell"><section className="auth-card"><h1>You’re offline</h1><p>Your saved app shell is available, but fresh follow-ups need a connection.</p><Link className="button primary" href="/jumps">Try again</Link></section></main>;
}
