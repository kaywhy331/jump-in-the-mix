"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * True once /api/auth/browser-context confirms this browser holds a verified session with a workspace
 * (the same answer the app's own boundary uses). Anything else, including an offline or failed check,
 * leaves the public "Sign in" link in place.
 */
export function useSignedInBrowser(): boolean {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/browser-context", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(response => response.ok ? response.json() as Promise<unknown> : null)
      .then(result => setSignedIn(Boolean(result && typeof result === "object" && "scope" in result && typeof result.scope === "string")))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return signedIn;
}

/** "Open Today" for a signed-in visitor on a public page, "Sign in" for everyone else. */
export function OpenAppLink({ signedIn, className }: { signedIn: boolean; className?: string }) {
  return signedIn ? <Link className={className} href="/jumps">Open Today</Link> : <Link className={className} href="/login">Sign in</Link>;
}
