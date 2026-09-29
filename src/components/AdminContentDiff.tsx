import type { LibraryContent } from "@/lib/library-content";
export function AdminContentDiff({ before, after }: { before: Partial<LibraryContent> & { subject?: string; body?: string }; after: Partial<LibraryContent> & { subject?: string; body?: string } }) {
  const labels: Record<string, string> = { title: "Title", description: "Description", category: "Category", industry: "Industry", framework: "Short label", triggerMode: "Start trigger", dateTypeName: "Saved date name", dateTypeSlug: "Saved date key", featured: "Featured", subject: "Subject", body: "Introduction" };
  const text = (value: unknown) => value === null || value === undefined || value === "" ? "None" : String(value);
  const changes = Object.entries(labels).filter(([key]) => before[key as keyof typeof before] !== after[key as keyof typeof after]).map(([key, label]) => ({ label, before: text(before[key as keyof typeof before]), after: text(after[key as keyof typeof after]) }));
  const count = Math.max(before.steps?.length ?? 0, after.steps?.length ?? 0);
  for (let index = 0; index < count; index++) {
    const old = before.steps?.[index], next = after.steps?.[index];
    const beat = (row: typeof old) => row ? `${row.name} · ${row.channel} · day ${row.dayOffset} · ${row.sendTimeMinutes === null ? "account default time" : `${Math.floor(row.sendTimeMinutes / 60)}:${String(row.sendTimeMinutes % 60).padStart(2, "0")}`}\n${[row.subject, row.body, row.script].filter(Boolean).join("\n")}\nLong SMS: ${row.longSms ? "yes" : "no"} · Opt-out wording: ${row.includeOptOut ? "yes" : "no"}` : "No Beat";
    if (JSON.stringify(old) !== JSON.stringify(next)) changes.push({ label: `Beat ${index + 1}`, before: beat(old), after: beat(next) });
  }
  return <section className="admin-content-diff"><h3>Changes from the published version</h3>{changes.length ? <>{changes.map(change => <details key={change.label}><summary>{change.label} changed</summary><div className="admin-diff-columns"><div><h4>Published</h4><p>{change.before}</p></div><div><h4>Saved draft</h4><p>{change.after}</p></div></div></details>)}</> : <p>No content changes from the published version.</p>}</section>;
}
