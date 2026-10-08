"use client";
import { useEffect, useState } from "react";

/**
 * `stageMoves`: with a Contact stage, how many of the people the save starts (`stage.all`, `stage.groupIds`, and with
 * `stage.resume` the people Everyone takes in when the Mix is turned back on) would move to it (UX-01, UX-09).
 */
type Audience = { total: number; missingEmail: number; missingPhone: number; stageMoves?: number; stageMovesFromOtherStages?: number; stageStarts?: number };
export function useAudiencePreview(all: boolean, groupIds: string[], stage: { stageId: string; mixId?: string; all: boolean; groupIds: string[]; resume?: boolean } | null = null) {
  const key = JSON.stringify([all, [...groupIds].sort(), stage?.stageId ?? "", stage?.mixId ?? "", stage?.all ?? false, [...(stage?.groupIds ?? [])].sort(), stage?.resume ?? false]);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; data?: Audience; error?: string }>({ key: "" });
  useEffect(() => {
    const [everyone, groups, stageId, mixId, stageAll, stageGroups, stageResume] = JSON.parse(key) as [boolean, string[], string, string, boolean, string[], boolean];
    if (!everyone && !groups.length) { setState({ key, data: { total: 0, missingEmail: 0, missingPhone: 0 } }); return; }
    const controller = new AbortController();
    setState({ key });
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams(groups.map(id => ["group", id]));
        if (everyone) params.set("all", "1");
        if (stageId) params.set("stage", stageId);
        if (stageId && mixId) params.set("mix", mixId);
        if (stageId && stageAll) params.set("stageAll", "1");
        if (stageId) for (const id of stageGroups) params.append("stageGroup", id);
        if (stageId && mixId && stageResume) params.set("stageResume", "1");
        const response = await fetch(`/api/contacts/audience?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Audience unavailable. Retry before starting this Mix.");
        const data = await response.json() as Audience;
        if (!controller.signal.aborted) setState({ key, data });
      } catch { if (!controller.signal.aborted) setState({ key, error: "Audience unavailable. Retry before starting this Mix." }); }
    }, 150);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [key, retry]);
  return { data: state.key === key ? state.data : undefined, error: state.key === key ? state.error : undefined, retry: () => setRetry(value => value + 1) };
}
