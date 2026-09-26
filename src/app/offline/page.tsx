import Link from "next/link";

export default function OfflinePage() {
  return <main className="auth-shell"><section className="auth-card"><h1>You’re offline</h1><p>Reconnect to see your contacts and follow-ups. Saved changes remain available when you reconnect. Unsaved text stays only in the open form; keep that tab open and retry saving after your connection returns. Reloading or closing an unsaved form can lose its contents.</p><Link className="button primary" href="/jumps">Try again</Link></section></main>;
}
