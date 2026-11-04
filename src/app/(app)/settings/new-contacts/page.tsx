import type { Metadata } from "next";
import Link from "next/link";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { BackLink } from "@/components/BackLink";
import { Notice } from "@/components/Notice";
import { ViewOnlySupportNotice } from "@/components/ViewOnlySupportNotice";
import { requireWorkspace } from "@/lib/auth";
import { NewContactsPlacementForm } from "@/components/NewContactsPlacementForm";
import { viewerErrorMessage } from "@/lib/form-errors";
import { saveNewContactPlacementAction } from "@/lib/new-contact-actions";
import { placeableMixFilter } from "@/lib/new-contact-placement";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "New contacts" };

/** Keep validation in the existing action, but return its signed error without navigating away from the draft. */
async function savePlacementFormAction(data: FormData): Promise<string | null> {
  "use server";
  try { await saveNewContactPlacementAction(data); }
  catch (cause) {
    if (!isRedirectError(cause)) throw cause;
    const destination = getURLFromRedirectError(cause);
    const prefix = "/settings/new-contacts?";
    if (!destination.startsWith(prefix)) throw cause;
    const params = Object.fromEntries(new URLSearchParams(destination.slice(prefix.length)));
    if (!params.error) throw cause; // Successful saves and sign-in redirects keep their normal navigation.
    const { session } = await requireWorkspace();
    return viewerErrorMessage(params, session);
  }
  return null;
}

/** Where people go when they are added (JITM-09 §2.78, D34). The default leaves them out, as No Mix. */
export default async function NewContactsSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; at?: string; sig?: string }> }) {
  const [params, { session, workspace, impersonation }] = await Promise.all([searchParams, requireWorkspace()]);
  const viewOnly = Boolean(impersonation);
  const [preference, mixes] = await Promise.all([
    prisma.workspacePreference.findUnique({ where: { workspaceId: workspace.id }, select: { newContactPlacement: true, newContactMixId: true } }),
    prisma.mix.findMany({ where: await placeableMixFilter(prisma, workspace.id), select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 200 })
  ]);
  const placement = preference?.newContactPlacement ?? "NONE";
  const chosen = mixes.find(mix => mix.id === preference?.newContactMixId) ?? null;
  return <div className="page page--form new-contacts-settings">
    <BackLink href="/settings" label="Settings" /><header className="page-header"><div><h1>New contacts</h1><p>Choose where people go when you add them, so nobody is left without a next step.</p></div></header>
    {params.saved && <Notice type="success">New contacts setting saved.</Notice>}
    {viewOnly && <ViewOnlySupportNotice />}
    {placement === "MIX" && !chosen && <Notice type="info">The Mix you chose is turned off, removed or now starts after another Mix. This setting won’t start a Mix until you choose another; Contact stage and Everyone rules still apply.</Notice>}
    <section className="card">
      <NewContactsPlacementForm placement={placement} chosen={chosen} mixes={mixes} viewOnly={viewOnly} serverError={viewerErrorMessage(params, session)} saveAction={savePlacementFormAction} />
    </section>
    <details className="card"><summary>Where this applies and what can override it</summary><ul className="new-contacts-rules">
      <li>Add a contact and Quick Add show the choice before you save. With Choose when adding, Add a contact starts with a follow-up ticked and Quick Add offers a Mix.</li>
      <li>People from your phone and from <Link className="inline-action" href="/settings/connections">lead connections</Link> use this setting without a prompt. With Choose when adding, they wait on <Link className="inline-action" href="/jumps">Today</Link>’s No Mix line if no other rule starts a Mix. Each lead connection can follow this setting, choose its own Mix or start none.</li>
      <li>Imports ask in their review step, with the default Mix already chosen when it applies. Nothing starts from an import without your confirmation.</li>
      <li>If a <Link className="inline-action" href="/settings/journey">Contact stage</Link> starts its own Mix for someone, the default Mix isn’t added on top. A Mix you pick while adding them still starts.</li>
      <li>Mixes for Everyone include new contacts whatever you choose here.</li>
      <li>People added with a visit, during onboarding or by an invitation don’t take this setting’s Mix.</li>
    </ul></details>
  </div>;
}
