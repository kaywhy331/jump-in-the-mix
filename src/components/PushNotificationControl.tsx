"use client";

import { useEffect, useState } from "react";

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const bytes = atob((value + padding).replaceAll("-", "+").replaceAll("_", "/"));
  const array = new Uint8Array(new ArrayBuffer(bytes.length));
  for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index);
  return array;
}

export function PushNotificationControl({ publicKey, configured }: { publicKey: string; configured: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  useEffect(() => {
    if (!supported) return;
    void navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then((subscription) => setEnabled(Boolean(subscription)));
  }, [supported]);

  const turnOn = async () => {
    setBusy(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notifications were not allowed on this device.");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
      const response = await fetch("/api/notifications/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(subscription) });
      if (!response.ok) throw new Error("This device could not be subscribed.");
      setEnabled(true);
      setMessage("Push reminders are on.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Push reminders could not be enabled.");
    } finally { setBusy(false); }
  };

  const turnOff = async () => {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/notifications/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      setEnabled(false);
      setMessage("Push reminders are off.");
    } catch { setMessage("Push reminders could not be disabled."); }
    finally { setBusy(false); }
  };

  if (!configured) return <p className="muted-copy">Web Push is not configured on this server.</p>;
  if (!supported) return <p className="muted-copy">This browser does not support Web Push. On iPhone, install the app to the Home Screen first.</p>;
  return <div className="push-control"><div><strong>{enabled ? "Push reminders are on" : "Push reminders are off"}</strong><p>Get one reminder when follow-ups are due or overdue.</p></div><button className={enabled ? "button" : "button primary"} type="button" disabled={busy} onClick={enabled ? turnOff : turnOn}>{busy ? "Saving…" : enabled ? "Turn off" : "Turn on"}</button>{message && <small role="status">{message}</small>}</div>;
}
