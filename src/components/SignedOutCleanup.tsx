"use client";

import { useEffect } from "react";
import { clearForeignNotifications, clearPrivateBrowserState, signalBrowserChange } from "@/lib/private-browser-state";

export function SignedOutCleanup() {
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/browser-context", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok || (await response.json()).scope !== null || controller.signal.aborted) return;
      clearPrivateBrowserState(); signalBrowserChange(true); void clearForeignNotifications();
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  return null;
}
