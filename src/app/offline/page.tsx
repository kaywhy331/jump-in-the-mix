import Link from "next/link";

export default function OfflinePage() {
  return <main className="auth-shell"><section className="auth-card"><h1>You’re offline</h1><p>Reconnect to see your contacts and follow-ups. Your saved work will be there when you’re back online.</p><Link className="button primary" href="/jumps">Try again</Link></section></main>;
}
