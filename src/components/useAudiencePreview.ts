"use client";
import { useEffect, useState } from "react";

type Audience = { total: number; missingEmail: number; missingPhone: number };
export function useAudiencePreview(all: boolean, groupIds: string[]) {
  const key = JSON.stringify([all, [...groupIds].sort()]);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; data?: Audience; error?: string }>({ key: "" });
  useEffect(() => {
    const [everyone, groups] = JSON.parse(key) as [boolean, string[]];
    if (!everyone && !groups.length) { setState({ key, data: { total: 0, missingEmail: 0, missingPhone: 0 } }); return; }
    const controller = new AbortController();
    setState({ key });
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams(groups.map(id => ["group", id]));
        if (everyone) params.set("all", "1");
        const response = await fetch(`/api/contacts/audience?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Audience unavailable. Retry before starting this mix.");
        const data = await response.json() as Audience;
        if (!controller.signal.aborted) setState({ key, data });
      } catch { if (!controller.signal.aborted) setState({ key, error: "Audience unavailable. Retry before starting this mix." }); }
    }, 150);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [key, retry]);
  return { data: state.key === key ? state.data : undefined, error: state.key === key ? state.error : undefined, retry: () => setRetry(value => value + 1) };
}
