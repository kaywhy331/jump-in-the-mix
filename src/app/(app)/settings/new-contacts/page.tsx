import type { Metadata } from "next";
import Link from "next/link";
import { BackLink } from "@/components/BackLink";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { Notice } from "@/components/Notice";
import { UrlErrorNotice } from "@/components/UrlErrorNotice";
import { ViewOnlySupportNotice } from "@/components/ViewOnlySupportNotice";
import { requireWorkspace } from "@/lib/auth";
import { saveNewContactPlacementAction } from "@/lib/new-contact-actions";
import { placeableMixWhere } from "@/lib/new-contact-placement";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "New contacts" };

/** Where people go when they are added (JITM-09 §2.78, D34). The default leaves them out, as No Mix. */
export default async function NewContactsSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; at?: string; sig?: string }> }) {
  const [params, { session, workspace, impersonation }] = await Promise.all([searchParams, requireWorkspace()]);
  const viewOnly = Boolean(impersonation);
  const [preference, mixes] = await Promise.all([
    prisma.workspacePreference.findUnique({ where: { workspaceId: workspace.id }, select: { newContactPlacement: true, newContactMixId: true } }),
    prisma.mix.findMany({ where: placeableMixWhere(workspace.id), select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 200 })
  ]);
  const placement = preference?.newContactPlacement ?? "NONE";
  const chosen = mixes.find(mix => mix.id === preference?.newContactMixId) ?? null;
  const option = (value: typeof placement, title: string, detail: string) => <label className="checkbox-card"><input type="radio" name="placement" value={value} defaultChecked={placement === value} required /><span><strong>{title}</strong><small>{detail}</small></span></label>;
  return <div className="page page--form new-contacts-settings">
    <BackLink href="/settings" label="Settings" /><header className="page-header"><div><h1>New contacts</h1><p>Choose where people go when you add them, so nobody is left without a next step.</p></div></header>
    {params.saved && <Notice type="success">New contacts setting saved.</Notice>}
    <UrlErrorNotice params={params} viewer={session} />
    {viewOnly && <ViewOnlySupportNotice />}
    {placement === "MIX" && !chosen && <Notice type="info">The Mix you chose is turned off or removed, so new contacts are left out until you choose another.</Notice>}
    <section className="card">
      <form action={saveNewContactPlacementAction} className="form-stack">
        <fieldset className="form-stack"><legend>Where new contacts go</legend>
          {option("NONE", "Leave them out", "They show as No Mix until you add them to a Mix.")}
          {option("MIX", "Add them to a Mix", "They start it on the day you add them.")}
          {mixes.length ? <div className="field new-contacts-mix"><label htmlFor="newContactMixId">Mix for new contacts</label><select id="newContactMixId" name="mixId" defaultValue={chosen?.id ?? ""} aria-describedby="newContactMixHint"><option value="">Choose a Mix</option>{mixes.map(mix => <option key={mix.id} value={mix.id}>{mix.name}</option>)}</select><small id="newContactMixHint">Mixes that start when you start them for someone.</small></div>
            : <p className="muted-copy new-contacts-mix">No Mix can be chosen yet. <Link className="inline-action" href="/mixes/new?custom=1">Create a Mix</Link> that starts when you start it for someone.</p>}
          {option("ASK", "Ask each time", "Add a contact starts with a follow-up ticked, and Quick Add offers a Mix.")}
        </fieldset>
        <FormSubmitButton label="Save" pendingLabel="Saving…" disabled={viewOnly} />
      </form>
    </section>
    <section className="card"><h2>Where this applies</h2><ul className="new-contacts-rules">
      <li>Add a contact and Quick Add show the Mix before you save, so you can change it.</li>
      <li>People from your phone and from <Link className="inline-action" href="/settings/connections">lead connections</Link> start the chosen Mix on their own. With Ask each time, they wait on Today’s No Mix line, where you can add them to a Mix together. Each lead connection can also choose its own Mix.</li>
      <li>Imports ask in their review step, with this Mix already chosen.</li>
      <li>If a Contact stage starts its own Mix for someone, this one isn’t added on top.</li>
      <li>Mixes for Everyone include new contacts whatever you choose here.</li>
    </ul></section>
  </div>;
}
