"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { marketingScenarioId } from "@/lib/marketing-scenarios";

export function WaitlistLink({ scenarioId, className, children }: { scenarioId?: string; className?: string; children: ReactNode }) {
  const [scenario, setScenario] = useState(() => marketingScenarioId(scenarioId));
  useEffect(() => {
    const current = document.querySelector("[data-marketing-scenario]")?.getAttribute("data-marketing-scenario");
    if (current) setScenario(marketingScenarioId(current));
    const update = (event: Event) => setScenario(marketingScenarioId((event as CustomEvent<{ scenario?: string }>).detail?.scenario));
    window.addEventListener("jitm:scenario", update);
    return () => window.removeEventListener("jitm:scenario", update);
  }, []);
  return <Link className={className} href={scenario ? `/waitlist?scenario=${encodeURIComponent(scenario)}` : "/waitlist"}>{children}</Link>;
}
