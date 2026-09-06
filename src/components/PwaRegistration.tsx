"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Public/login visits also replace old workers which saved private pages.
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then(registration => { if (registration.active) return registration.update(); })
      .catch(() => undefined);
  }, []);
  return null;
}
