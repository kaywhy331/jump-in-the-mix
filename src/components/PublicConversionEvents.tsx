"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type Placement = "header" | "hero" | "sample" | "workflow" | "closing" | "footer" | "registration";
type PublicEvent = {
  name: "homepage_view" | "sample_engaged" | "handoff_requested" | "signup_start" | "registration_view" | "signup_submit";
  placement?: Placement;
  channel?: "text" | "email" | "phone";
};

// A collector can subscribe before hydration. No provider, network request,
// identifier, cookie, draft text, or form value is introduced by this adapter.
export function PublicConversionEvents() {
  const pathname = usePathname();
  useEffect(() => {
    const profession = pathname.startsWith("/for/") ? pathname.slice(5) : null;
    if (pathname !== "/" && pathname !== "/register" && !profession) return;
    if (navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return;
    let engaged = false;
    const emit = (event: PublicEvent) => window.dispatchEvent(new CustomEvent("jitm:conversion", {
      detail: { ...event, version: "relationships-v1", ...(profession ? { route: profession } : {}), viewport: matchMedia("(max-width: 760px)").matches ? "compact" : "wide" }
    }));
    emit({ name: pathname === "/register" ? "registration_view" : "homepage_view" });
    const engage = () => { if (!engaged) { engaged = true; emit({ name: "sample_engaged", placement: "sample" }); } };
    const click = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest(".product-demo") && target.closest("button, a, input, summary, select, textarea")) engage();
      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (!link) return;
      const href = link.getAttribute("href") ?? "";
      if (link.closest(".demo-actions") && /^(sms:|mailto:|tel:)/.test(href)) {
        emit({ name: "handoff_requested", placement: "sample", channel: href.startsWith("sms:") ? "text" : href.startsWith("mailto:") ? "email" : "phone" });
      }
      if (href === "/register" || href === "/waitlist") {
        const placements: [string, Placement][] = [[".public-header", "header"], [".hero-actions", "hero"], [".product-demo", "sample"], [".today-preview", "workflow"], [".public-control", "closing"], [".public-footer", "footer"]];
        const placement = placements.find(([selector]) => link.closest(selector))?.[1];
        emit({ name: "signup_start", ...(placement ? { placement } : {}) });
      }
    };
    const input = (event: Event) => { if (event.target instanceof Element && event.target.closest(".product-demo")) engage(); };
    const submit = (event: SubmitEvent) => {
      if (pathname === "/register" && event.target instanceof HTMLFormElement && event.target.closest(".registration-card")) emit({ name: "signup_submit", placement: "registration" });
    };
    document.addEventListener("click", click, true);
    document.addEventListener("input", input, true);
    document.addEventListener("submit", submit, true);
    return () => {
      document.removeEventListener("click", click, true);
      document.removeEventListener("input", input, true);
      document.removeEventListener("submit", submit, true);
    };
  }, [pathname]);
  return null;
}
