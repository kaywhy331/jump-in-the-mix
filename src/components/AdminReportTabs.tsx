import Link from "next/link";
import { adminQuery } from "@/lib/admin-navigation";
export const REPORT_VIEWS = ["growth", "engagement", "content", "operations"] as const;
export type ReportView = typeof REPORT_VIEWS[number];
export function reportView(value?: string): ReportView { return REPORT_VIEWS.includes(value as ReportView) ? value as ReportView : "growth"; }
export function AdminReportTabs({ path, view, params }: { path: string; view: ReportView; params: Record<string, string | undefined> }) {
  return <nav className="admin-content-tabs" aria-label="Report sections">{REPORT_VIEWS.map(item => <Link key={item} prefetch={false} href={adminQuery(path, { ...params, view: item })} aria-current={view === item ? "page" : undefined}>{item[0].toUpperCase() + item.slice(1)}</Link>)}</nav>;
}
