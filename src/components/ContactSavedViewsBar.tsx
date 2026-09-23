import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AppIcon } from "@/components/AppIcon";
import { deleteContactViewAction, saveContactViewAction, setDefaultContactViewAction } from "@/lib/contact-view-actions";

export type ContactSavedViewDto = {
  id: string;
  name: string;
  isDefault: boolean;
};

export function ContactSavedViewsBar({
  views,
  selectedViewId,
  filters
}: {
  views: ContactSavedViewDto[];
  selectedViewId: string;
  filters: { sort?: string; q: string; group: string; priority: string; permission: string };
}) {
  return (
    <section className="contact-saved-views" aria-label="Saved Contact views">
      <div className="contact-saved-view-links"><Link className={!selectedViewId ? "button small primary" : "button small"} href="/contacts">All Contacts</Link>{views.map((view) => <Link className={selectedViewId === view.id ? "button small primary" : "button small"} href={`/contacts?view=${encodeURIComponent(view.id)}`} key={view.id}>{view.name}{view.isDefault ? " · default" : ""}</Link>)}</div>
      <Sheet trigger={<button className="button small" type="button">Save or manage view</button>} title="Saved contact views" description="Save these filters or manage an existing view.">
        <form action={saveContactViewAction} className="form-stack"><input type="hidden" name="sort" value={filters.sort ?? "name"} /><input type="hidden" name="q" value={filters.q} /><input type="hidden" name="group" value={filters.group} /><input type="hidden" name="priority" value={filters.priority} /><input type="hidden" name="permission" value={filters.permission} /><label className="field"><span>View name</span><input name="name" maxLength={80} placeholder="High-priority customers" required /></label><button className="button primary" type="submit">Save current filters</button></form>
        {views.length > 0 && <div className="contact-saved-view-list">{views.map((view) => <div key={view.id}><span>{view.name}{view.isDefault ? " · default" : ""}</span><div className="page-actions">{!view.isDefault && <form action={setDefaultContactViewAction}><input type="hidden" name="viewId" value={view.id} /><button className="text-button" type="submit">Make default</button></form>}<ConfirmDialog trigger="Delete…" triggerAriaLabel={`Delete ${view.name}`} triggerClassName="text-button danger-text" title={`Delete the ${view.name} view?`} description="Your contacts stay exactly as they are; only this saved filter is removed." danger><form action={deleteContactViewAction}><input type="hidden" name="viewId" value={view.id} /><button className="button danger" type="submit"><AppIcon name="trash" />Delete view</button></form></ConfirmDialog></div></div>)}</div>}
      </Sheet>
    </section>
  );
}
