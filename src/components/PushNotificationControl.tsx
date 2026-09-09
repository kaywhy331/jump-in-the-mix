"use client";

import { useEffect, useState } from "react";
import { useBrowserScope } from "@/components/BrowserAccountBoundary";

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const bytes = atob((value + padding).replaceAll("-", "+").replaceAll("_", "/"));
  const array = new Uint8Array(new ArrayBuffer(bytes.length));
  for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index);
  return array;
}

export function PushNotificationControl({ publicKey, configured }: { publicKey: string; configured: boolean }) {
  const scope = useBrowserScope();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [supported, setSupported] = useState<boolean | null>(null);
  const [installFirst, setInstallFirst] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const deviceRequest = (url: string, options: RequestInit = {}) => fetch(url, {
    ...options, cache: "no-store", headers: { "content-type": "application/json", "x-jitm-browser-scope": scope ?? "", ...options.headers }
  });

  useEffect(() => {
    let mounted = true;
    const available = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    setSupported(available);
    setInstallFirst(ios && !standalone);
    setBlocked(available && Notification.permission === "denied");
    if (available && configured) {
      void (async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (!subscription) return;
        const response = await deviceRequest("/api/notifications/subscribe");
        if (!response.ok) throw new Error("Could not check this device. Reload to try again.");
        const data = await response.json();
        if (mounted) setEnabled(Notification.permission === "granted" && data.endpoints.includes(subscription.endpoint));
      })().catch(error => { if (mounted) setMessage(error instanceof Error ? error.message : "Could not check this device."); })
        .finally(() => { if (mounted) setChecking(false); });
    } else setChecking(false);
    return () => { mounted = false; };
  }, [configured, scope]);

  const readyRegistration = async () => {
    await navigator.serviceWorker.register("/sw.js");
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("The app could not prepare reminders. Reload and try again.")), 15_000); })
      ]);
    } finally { clearTimeout(timeout); }
  };

  const turnOn = async () => {
    setBusy(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      setBlocked(permission === "denied");
      if (permission !== "granted") throw new Error("Notifications were not allowed on this device.");
      const registration = await readyRegistration();
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
      const response = await deviceRequest("/api/notifications/subscribe", { method: "POST", body: JSON.stringify(subscription) });
      if (!response.ok) {
        // A late response must not unsubscribe a device another account has
        // since enabled. Unregistered subscriptions cannot receive our pushes.
        const result = await response.json();
        throw new Error(result.error || "This device could not be subscribed. Please try again.");
      }
      setEnabled(true);
      setMessage("Reminders are on for this device. Send a test to check they appear.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Push reminders could not be enabled.");
    } finally { setBusy(false); }
  };

  const turnOff = async () => {
    setBusy(true);
    setMessage("");
    try {
      const registration = await readyRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await deviceRequest("/api/notifications/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint: subscription.endpoint }) });
        if (!response.ok) throw new Error("Could not turn off reminders.");
        // Server removal stops delivery. Keep the browser endpoint so an old
        // tab cannot invalidate a newer account's explicit opt-in.
      }
      setEnabled(false);
      setMessage("Push reminders are off.");
    } catch { setMessage("Push reminders could not be disabled."); }
    finally { setBusy(false); }
  };

  const sendTest = async () => {
    setBusy(true);
    setMessage("");
    try {
      const registration = await readyRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) { setEnabled(false); throw new Error("Turn on reminders on this device first."); }
      const response = await deviceRequest("/api/notifications/test", { method: "POST", body: JSON.stringify({ endpoint: subscription.endpoint }) });
      const result = await response.json();
      if (response.status === 410) { await subscription.unsubscribe(); setEnabled(false); }
      if (response.status === 409 || response.status === 401) setEnabled(false);
      if (!response.ok) throw new Error(result.error || "The test could not be sent.");
      setMessage("Test sent. Check your device’s notifications; Focus or Do Not Disturb may silence it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The test could not be sent.");
    } finally { setBusy(false); }
  };

  if (!configured) return <p className="muted-copy">Web Push is not configured on this server.</p>;
  if (supported === null || checking) return <p className="muted-copy">Checking reminders on this device…</p>;
  if (installFirst) return <div className="muted-copy"><p>On iPhone or iPad (16.4 or later), open this site in Safari, tap Share, then Add to Home Screen.</p><p>Open the app from your Home Screen, return here, and tap Turn on.</p></div>;
  if (!supported) return <p className="muted-copy">This browser does not support push reminders. Try Chrome on Android or install the app on an iPhone Home Screen.</p>;
  return <div className="push-control"><div><strong>{enabled ? "Push reminders are on" : "Push reminders are off"}</strong><p>Get notified when follow-ups become due, even while the app is closed. Items due together are grouped, and quiet hours are respected.</p><p className="muted-copy">Reminders arrive after the next background check and may take a few minutes. They pause when this browser signs out or its session expires. After switching accounts, turn them on again for the account you want to use.</p></div>{blocked && <p role="status">Notifications are blocked. Allow notifications for this app in your browser or device settings, then reload.</p>}<div className="page-actions"><button className={enabled ? "button" : "button primary"} type="button" disabled={busy || (blocked && !enabled)} onClick={enabled ? turnOff : turnOn}>{busy ? "Working…" : enabled ? "Turn off" : "Turn on"}</button>{enabled && <button className="button" type="button" disabled={busy || blocked} onClick={sendTest}>Send test notification</button>}</div>{message && <small role="status">{message}</small>}</div>;
}
