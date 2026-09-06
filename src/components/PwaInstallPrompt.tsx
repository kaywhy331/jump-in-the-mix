"use client";

import { useEffect, useState } from "react";

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
      if (!preference(DISMISSED_KEY) && !standalone) setEligible(true);
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
  if (!isIos && !installEvent) return null;
  const dismiss = () => { savePreference(DISMISSED_KEY); setEligible(false); };
  const install = async () => {
    if (!installEvent) { setIosHelp(true); return; }
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted") setEligible(false);
    } catch { /* Browser dismissed or no longer permits this install prompt. */ }
    finally { setInstallEvent(null); }
  };

  return <aside className="pwa-install-prompt" role="status"><div><strong>Keep Today on your home screen</strong><p>{iosHelp || (isIos && !installEvent) ? "In Safari, tap Share, then Add to Home Screen." : "Open follow-ups faster and receive reminders."}</p></div><div className="page-actions"><button className="button primary" type="button" onClick={install}>{isIos && !installEvent ? "Show me how" : "Install app"}</button><button className="button" type="button" onClick={dismiss}>Not now</button></div></aside>;
}
