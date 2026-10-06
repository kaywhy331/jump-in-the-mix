import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { BackLink } from "@/components/BackLink";
import { ContactShareKeyPanel } from "@/components/ContactShareKeyPanel";
import { DeviceContactQuickAdd } from "@/components/DeviceContactQuickAdd";
import { IphoneAddTips } from "@/components/IphoneAddTips";
import { Notice } from "@/components/Notice";
import { requireWorkspace } from "@/lib/auth";
import { contactShareKeyStatus } from "@/lib/contact-share-keys";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { env } from "@/lib/env";
import { formatDate, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Add from your phone" };

export default async function AddFromPhonePage({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const [{ workspace, user, impersonation }, query, requestHeaders] = await Promise.all([requireWorkspace(), searchParams, headers()]);
  const owner = workspace.ownerId === user.id;
  const [status, display] = await Promise.all([owner ? contactShareKeyStatus(workspace.id, user.id) : null, displayPreferencesForUser(user.id)]);
  // Phones see only their own steps; iPads and computers see both.
  const userAgent = requestHeaders.get("user-agent") ?? "";
  const iphone = /iPhone|iPod/.test(userAgent);
  const android = /Android/.test(userAgent);
  // The shortcut steps appear once its link is set; `?setup=shortcut` shows them while the shortcut is being built.
  // An existing key always shows, so its owner can see when it was used and turn it off.
  const shortcutReady = Boolean(env.iphoneContactsShortcutUrl) || query.setup === "shortcut" || Boolean(status);

  return (
    <div className="page page--form phone-share-page">
      <BackLink href="/contacts/new" label="Add a contact" />
      <header className="page-header"><div><h1>Add from your phone</h1><p>Only the people you choose are added. Someone already saved with the same email or phone isn&apos;t added twice.</p></div></header>
      {!owner && <Notice type="info">Only the account owner can add people from a phone.</Notice>}
      {!android && <IphoneAddTips shortcut={owner && shortcutReady} />}
      {!iphone && (
        <section className="card phone-share-card" aria-labelledby="phone-share-android">
          <h2 id="phone-share-android">{android ? "Choose from your contacts" : "On Android"}</h2>
          <DeviceContactQuickAdd placement="page" />
        </section>
      )}
      {!android && owner && shortcutReady && (
        <ContactShareKeyPanel
          title={iphone ? "Share from Contacts" : "On iPhone: share from Contacts"}
          shortcutUrl={env.iphoneContactsShortcutUrl}
          keyStatus={status ? { made: formatDate(status.createdAt, display), lastUsed: status.lastUsedAt ? formatDateTime(status.lastUsedAt, display) : null } : null}
          viewOnly={Boolean(impersonation)}
        />
      )}
      {!android && (
        <section className="card phone-share-card" aria-labelledby="phone-share-file">
          <h2 id="phone-share-file">{!iphone ? "On iPhone: save a contact card" : shortcutReady ? "Or save a contact card" : "Save a contact card"}</h2>
          <ol className="phone-share-steps">
            <li><strong>Share the contact</strong><small>In Contacts, open a person and tap Share Contact.</small></li>
            <li><strong>Save it</strong><small>Tap Save to Files.</small></li>
            <li><strong>Import it</strong><small>Choose the file in Import contacts.</small><div className="form-actions"><Link className="button" href="/contacts/import">Import contacts</Link></div></li>
          </ol>
        </section>
      )}
    </div>
  );
}
