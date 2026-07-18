import { headers } from "next/headers";

export type RequestMetadata = {
  ipAddress: string | null;
  userAgent: string | null;
};

function firstForwardedAddress(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

export async function getRequestMetadata(): Promise<RequestMetadata> {
  const store = await headers();
  return {
    ipAddress:
      firstForwardedAddress(store.get("x-forwarded-for")) ??
      store.get("cf-connecting-ip") ??
      store.get("x-real-ip") ??
      null,
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
