"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export function TodayBriefing({ text }: { text: string }) {
  const [available, setAvailable] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");
  const voice = useRef<SpeechSynthesisVoice | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return;
    const synthesis = window.speechSynthesis;
    const refresh = () => {
      // Never silently send a customer's summary to a remote synthesis voice.
      try { voice.current = synthesis.getVoices().find(item => item.localService && /^en(?:-|$)/i.test(item.lang)) ?? null; } catch { voice.current = null; }
      setAvailable(Boolean(voice.current));
    };
    refresh(); synthesis.addEventListener("voiceschanged", refresh);
    return () => { stopRef.current?.(); synthesis.removeEventListener("voiceschanged", refresh); };
  }, [pathname, text]);

  const speak = () => {
    if (stopRef.current) { stopRef.current(); return; }
    if (!voice.current || document.hidden || document.documentElement.dataset.browserLocked === "true") return;
    const synthesis = window.speechSynthesis;
    let utterance: SpeechSynthesisUtterance;
    try { utterance = new SpeechSynthesisUtterance(text); utterance.voice = voice.current; utterance.lang = voice.current.lang; }
    catch { setError("Read-aloud is unavailable. You can read the summary above."); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (stopRef.current !== stop) return;
      stopRef.current = null; clearTimeout(timer);
      utterance.onend = utterance.onerror = null;
      synthesis.cancel(); setSpeaking(false);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", stop); observer.disconnect();
    };
    const visibility = () => { if (document.hidden) stop(); };
    const observer = new MutationObserver(() => { if (document.documentElement.dataset.browserLocked === "true") stop(); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-browser-locked"] });
    document.addEventListener("visibilitychange", visibility); window.addEventListener("pagehide", stop);
    stopRef.current = stop;
    utterance.onend = stop;
    utterance.onerror = () => { setError("Read-aloud could not finish. You can read the summary above."); stop(); };
    setError(""); setSpeaking(true);
    timer = setTimeout(stop, 60_000);
    try { synthesis.speak(utterance); } catch { setError("Read-aloud is unavailable. You can read the summary above."); stop(); }
  };
  return <details className="today-briefing card" onToggle={event => { if (!event.currentTarget.open) stopRef.current?.(); }}>
    <summary>Today at a glance</summary>
    <p>{text}</p>
    {available ? <><button type="button" className="button small" onClick={speak} aria-pressed={speaking}>{speaking ? "Stop reading" : "Listen to summary"}</button><small>Uses a local voice reported by your browser.</small></> : <small>Read-aloud is unavailable on this device. Your summary is shown above.</small>}
    {error && <p role="status">{error}</p>}
  </details>;
}
