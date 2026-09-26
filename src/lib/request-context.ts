import { headers } from "next/headers";
import { clientAddressFromHeaders } from "@/lib/client-ip";
import { env } from "@/lib/env";
import { privateTestRequestAuthorized } from "@/lib/private-test";

export type RequestMetadata = {
  ipAddress: string | null;
  userAgent: string | null;
};

/**
 * The client address is read from the trusted proxy chain (Cloudflare in front of Render, plus
 * TRUSTED_PROXY_CIDRS), never from the first X-Forwarded-For hop that the client controls; the
 * rule and its truth table live in src/lib/client-ip.ts. The same rule applies in every
 * environment, and it yields null when the chain proves nothing (for example a direct loopback
 * request) so a forged value is never stored or rate-limited on.
 */
export async function getRequestMetadata(): Promise<RequestMetadata> {
  const store = await headers();
  if (!privateTestRequestAuthorized(store)) throw new Error("Private test access is required.");
  return {
    ipAddress: clientAddressFromHeaders((name) => store.get(name), { trustedCidrs: env.trustedProxyCidrs }),
    userAgent: store.get("user-agent")?.slice(0, 500) ?? null
  };
}

export function describeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";

  const browser = userAgent.includes("Edg/")
    ? "Edge"
    : userAgent.includes("Chrome/")
      ? "Chrome"
      : userAgent.includes("Firefox/")
        ? "Firefox"
        : userAgent.includes("Safari/")
          ? "Safari"
          : "Browser";

  const device = /iPhone|iPad|iPod/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Macintosh|Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "device";

  return `${browser} on ${device}`;
}
