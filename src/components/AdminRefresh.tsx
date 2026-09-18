"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
export function AdminRefresh({ observedAt, poll = false }: { observedAt: string; poll?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [paused, setPaused] = useState(false);
  const count = useRef(0);
  const [cycle, setCycle] = useState(0);
  const [age, setAge] = useState(0);
  useEffect(() => { const update = () => setAge(Math.max(0, Math.floor((Date.now() - new Date(observedAt).getTime()) / 60_000))); update(); const timer = setInterval(update, 30_000); return () => clearInterval(timer); }, [observedAt]);
  useEffect(() => {
    if (!poll) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (count.current >= 8) { setPaused(true); window.clearInterval(timer); return; }
      count.current++;
      start(() => router.refresh());
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [poll, router, cycle]);
  return <div className="admin-refresh"><span role="status">{pending ? "Updating…" : `Checked ${observedAt.slice(0, 19).replace("T", " ")} UTC · ${age} minute${age === 1 ? "" : "s"} ago`}{poll && (paused ? " · Automatic checks paused" : " · Checking every 15 seconds while visible, up to 8 times")}</span><button type="button" className="button small" disabled={pending} onClick={() => start(() => router.refresh())}>Refresh status</button>{poll && paused && <button className="button small" type="button" onClick={() => { count.current = 0; setPaused(false); setCycle(value => value + 1); start(() => router.refresh()); }}>Resume automatic checks</button>}</div>;
}
