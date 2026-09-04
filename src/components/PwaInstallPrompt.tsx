"use client";

import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const COMPLETED_KEY = "jitm:first-follow-up-completed";
const DISMISSED_KEY = "jitm:install-dismissed";

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [eligible, setEligible] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    const dismissed = window.localStorage.getItem(DISMISSED_KEY) === "1";
    const completed = window.localStorage.getItem(COMPLETED_KEY) === "1";
    setEligible(Boolean(completed && !dismissed && !standalone));

    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const completedFollowUp = (event: Event) => {
      const detail = (event as CustomEvent<{ status?: string }>).detail;
      if (detail?.status !== "DONE") return;
      window.localStorage.setItem(COMPLETED_KEY, "1");
      if (!window.localStorage.getItem(DISMISSED_KEY) && !standalone) setEligible(true);
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("jitm:jump-state", completedFollowUp);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("jitm:jump-state", completedFollowUp);
    };
  }, []);

  if (!eligible) return null;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const dismiss = () => { window.localStorage.setItem(DISMISSED_KEY, "1"); setEligible(false); };
  const install = async () => {
    if (!installEvent) { setIosHelp(true); return; }
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setEligible(false);
    setInstallEvent(null);
  };

  return <aside className="pwa-install-prompt" role="status"><div><strong>Keep Today on your home screen</strong><p>{iosHelp || (isIos && !installEvent) ? "In Safari, tap Share, then Add to Home Screen." : "Open follow-ups faster and receive reminders."}</p></div><div className="page-actions"><button className="button primary" type="button" onClick={install}>{isIos && !installEvent ? "Show me how" : "Install app"}</button><button className="button" type="button" onClick={dismiss}>Not now</button></div></aside>;
}
