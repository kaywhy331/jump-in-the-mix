"use client";

import { useEffect, useState } from "react";
import { AppIcon } from "@/components/AppIcon";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const COMPLETED_KEY = "jitm:first-follow-up-completed";
const DISMISSED_KEY = "jitm:install-dismissed";

function preference(key: string) { try { return window.localStorage.getItem(key) === "1"; } catch { return false; } }
function savePreference(key: string) { try { window.localStorage.setItem(key, "1"); } catch { /* Optional preference. */ } }

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [eligible, setEligible] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    const dismissed = preference(DISMISSED_KEY);
    const completed = preference(COMPLETED_KEY);
    setEligible(Boolean(completed && !dismissed && !standalone));

    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const completedFollowUp = (event: Event) => {
      const detail = (event as CustomEvent<{ status?: string }>).detail;
      if (detail?.status !== "DONE") return;
      savePreference(COMPLETED_KEY);
      // Offer the optional install on the next visit, after the outcome flow is finished.
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("jitm:jump-state", completedFollowUp);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("jitm:jump-state", completedFollowUp);
    };
  }, []);

  if (!eligible) return null;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIos && !installEvent && !error) return null;
  const dismiss = () => { savePreference(DISMISSED_KEY); setEligible(false); };
  const install = async () => {
    if (!installEvent) { setIosHelp(true); return; }
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted") setEligible(false);
    } catch { setError("Installation did not finish. You can keep using the app in your browser."); }
    finally { setInstallEvent(null); }
  };

  return <aside className="pwa-install-prompt" aria-label="Optional app installation">
    <div className="install-heading"><span className="install-icon"><AppIcon name="smartphone" /></span><div><small>Optional shortcut</small><strong>Keep Today on your home screen</strong></div></div>
    {error ? <><p role="status">{error}</p><button className="button" type="button" onClick={dismiss}>Close</button></> : iosHelp ? <div role="status"><p>In Safari:</p><ol><li>Tap the Share button.</li><li>Choose Add to Home Screen.</li><li>Tap Add.</li></ol><button className="button primary" type="button" onClick={dismiss}>Got it</button></div> : <><p>Open the app with a tap. You can also keep using your browser.</p><div className="install-actions"><button className="button primary" type="button" onClick={install}>{isIos && !installEvent ? "Show me how" : "Install app"}</button><button className="button" type="button" onClick={dismiss}>Not now</button></div></>}
  </aside>;
}
