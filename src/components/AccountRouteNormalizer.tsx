"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const HASH_SECTIONS: Record<string, string> = {
  "#billing": "billing",
  "#google-contacts": "connections",
  "#connections": "connections",
  "#security": "security",
  "#referrals": "referrals",
  "#support": "support",
  "#data-privacy": "privacy",
  "#privacy": "privacy"
};

export function AccountRouteNormalizer() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();

  useEffect(() => {
    if (pathname !== "/account") return;

    const normalize = () => {
      const params = new URLSearchParams(queryString);
      const hash = window.location.hash;
      const hashSection = HASH_SECTIONS[hash];
      const providerReturn = params.has("google") || params.has("googleError");
      const targetSection = hashSection || (!params.has("section") && providerReturn ? "connections" : null);

      if (targetSection && params.get("section") !== targetSection) {
        params.set("section", targetSection);
        const query = params.toString();
        const target = `/account${query ? `?${query}` : ""}`;
        window.history.replaceState(window.history.state, "", target);
        router.replace(target, { scroll: false });
        return;
      }

      if (hash) {
        window.setTimeout(() => document.querySelector(hash)?.scrollIntoView({ block: "start" }), 0);
      }
    };

    normalize();
    window.addEventListener("hashchange", normalize);
    return () => window.removeEventListener("hashchange", normalize);
  }, [pathname, queryString, router]);

  return null;
}
