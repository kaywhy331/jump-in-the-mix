import type { NextActionProjection } from "@/lib/next-action";

type WorkCounts = { overdue: number; today: number; upcoming: number };

/** Count obligations, never person cards or the currently loaded page of attention rows. */
export function todayWorkCategories(counts: WorkCounts, overdue: number, projection?: NextActionProjection) {
  if (projection?.state === "unavailable") return [];
  const current = projection?.items.filter(item => item.timing !== "future");
  const categories = [
    { label: "Overdue", count: current ? current.filter(item => item.kind === "follow-up" && item.timing === "overdue").length : overdue },
    { label: "Due today", count: current ? current.filter(item => item.kind === "follow-up" && item.timing === "due").length : Math.max(0, counts.overdue + counts.today - overdue) },
    { label: "Needs your input", count: current?.filter(item => item.kind !== "follow-up" || item.timing === "attention").length ?? 0 },
    { label: "Upcoming", count: projection?.futureCount ?? counts.upcoming }
  ];
  return categories.filter(category => category.count > 0);
}
