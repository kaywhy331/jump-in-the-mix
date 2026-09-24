"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { AppIcon } from "@/components/AppIcon";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { Sheet } from "@/components/Sheet";
import { addFromMarketplaceAction, reportAction, shareAction, unshareAction } from "@/lib/marketplace-actions";
import { MARKETPLACE_REASONS, MARKETPLACE_SUMMARY_MAX, warningLabel, type ShareWarning } from "@/lib/marketplace";

/** A heart with the number of people who favorited this share. */
export function ListingFavoriteButton({ listingId, name, initial, count, canEdit = true }: { listingId: string; name: string; initial: boolean; count: number; canEdit?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState({ favorite: initial, count }), [saving, setSaving] = useState(false), [error, setError] = useState("");
  useEffect(() => setState({ favorite: initial, count }), [initial, count]);
  const label = `${state.favorite ? `Remove ${name} from favorites` : `Add ${name} to favorites`} (${state.count} ${state.count === 1 ? "favorite" : "favorites"})`;
  return <div className="mix-favorite-control listing-favorite"><button className="listing-favorite-button" type="button" disabled={saving || !canEdit} aria-label={label} title={label} aria-pressed={state.favorite} onClick={async () => {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/marketplace/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId, favorite: !state.favorite }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setState({ favorite: data.favorite, count: data.count }); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save this favorite. Try again."); }
    finally { setSaving(false); }
  }}><AppIcon name="heart" fill={state.favorite ? "currentColor" : "none"} /><span aria-hidden="true">{state.count}</span></button>{error && <span className="mix-favorite-error" role="alert">{error}</span>}</div>;
}

export type ShareState = { id: string; status: "LIVE" | "UNSHARED" | "HIDDEN"; summary: string | null; industry: string | null } | null;

/** Share or stop sharing a Mix or Mega-Mix. The wording is checked for private details first. */
export function ShareSheet({ kind, targetId, targetName, publicName, listing, warnings, industries, canEdit, unavailable }: {
  kind: "MIX" | "MEGA_MIX"; targetId: string; targetName: string; publicName: string; listing: ShareState; warnings: ShareWarning[]; industries: string[]; canEdit: boolean; unavailable?: string;
}) {
  const noun = kind === "MIX" ? "Mix" : "Mega-Mix";
  const live = listing?.status === "LIVE", hidden = listing?.status === "HIDDEN";
  return <Sheet trigger={<button className="button small" type="button" aria-label={live ? `Shared on the Marketplace. Manage sharing for ${targetName}` : `Share ${targetName} on the Marketplace`}><AppIcon name="share" />{live ? "Shared" : "Share"}</button>} title={live ? "Shared on the Marketplace" : `Share this ${noun}`} description={live ? "People see your latest saved version. Your changes appear there as soon as you save them." : "Share it with other Jump in the Mix users. You can stop sharing at any time."}>
    {hidden ? <div className="form-stack"><p className="notice error" role="status">This share is hidden while our team reviews a report. Edit the wording if something needs fixing; we’ll let you know when the review is done.</p>{listing && <Link className="button" href={`/marketplace?section=mine&item=${encodeURIComponent(`listing:${listing.id}`)}`}>See the report</Link>}</div>
    : unavailable ? <p className="notice" role="status">{unavailable}</p>
    : !canEdit ? <p className="muted-copy">Only the account owner can share.</p>
    : <>
      <ActionForm action={shareAction} className="form-stack share-form">
        <input type="hidden" name="kind" value={kind} /><input type="hidden" name="targetId" value={targetId} />
        <label className="field"><span>Shared as</span><input name="publicName" required maxLength={60} defaultValue={publicName} autoComplete="organization" /><small>Shown on your shares. Never your email or phone number.</small></label>
        <label className="field"><span>What is it for? (optional)</span><textarea name="summary" rows={3} maxLength={MARKETPLACE_SUMMARY_MAX} defaultValue={listing?.summary ?? ""} placeholder="For example, follow-up after a kitchen estimate" /></label>
        <label className="field"><span>Business type (optional)</span><select name="industry" defaultValue={listing?.industry ?? ""}><option value="">Any business</option>{industries.map(item => <option key={item}>{item}</option>)}</select></label>
        <section className="share-check" aria-label="Privacy check">
          <h3><AppIcon name={warnings.length ? "alert" : "check"} />{warnings.length ? `Check ${warnings.length === 1 ? "1 detail" : `${warnings.length} details`} before sharing` : "No private details found"}</h3>
          {warnings.length ? <><p>Replace real names with <code>{"{{First Name}}"}</code> and remove phone numbers, email addresses and links you don’t want everyone to use.</p><ul>{warnings.map((item, index) => <li key={index}><strong>{warningLabel[item.kind]}:</strong> {item.text} <small>{item.where}</small></li>)}</ul></> : <p>We looked for names, phone numbers, email addresses and links. Read it once more before sharing.</p>}
        </section>
        <label className="checkbox-label"><input type="checkbox" name="confirmed" required />The wording has no private customer details, and I’m happy for others to copy and change it.</label>
        <FormSubmitButton label={live ? "Save share details" : `Share ${noun}`} pendingLabel="Sharing…" />
      </ActionForm>
      {live && listing && <div className="share-live-actions"><Link href={`/marketplace?section=mine&item=${encodeURIComponent(`listing:${listing.id}`)}`}><AppIcon name="store" />View on the Marketplace</Link>
        <ConfirmDialog trigger={<>Stop sharing</>} title={`Stop sharing ${targetName}?`} description="It leaves the Marketplace now. Copies people already added stay theirs, and your favorites count returns if you share again.">
          <ActionForm action={unshareAction} className="form-stack"><input type="hidden" name="listingId" value={listing.id} /><button className="button danger" type="submit">Stop sharing</button></ActionForm>
        </ConfirmDialog></div>}
    </>}
  </Sheet>;
}

export function ReportSheet({ listingId, title, reported }: { listingId: string; title: string; reported: boolean }) {
  const [reason, setReason] = useState("");
  const chosen = MARKETPLACE_REASONS.find(item => item.value === reason);
  if (reported) return <p className="muted-copy listing-reported"><AppIcon name="flag" />You reported this. Our team will review it.</p>;
  return <Sheet trigger={<button className="text-button listing-report" type="button"><AppIcon name="flag" />Report</button>} title="Report this share" description={`Tell us what is wrong with “${title}”. The author is told a report was made, not who made it.`}>
    <ActionForm action={reportAction} className="form-stack">
      <input type="hidden" name="listingId" value={listingId} />
      <fieldset className="report-reasons"><legend>What is wrong?</legend>{MARKETPLACE_REASONS.map(item => <label key={item.value} className="checkbox-label"><input type="radio" name="reason" value={item.value} required checked={reason === item.value} onChange={() => setReason(item.value)} /><span><strong>{item.label}</strong><small>{item.hint}</small></span></label>)}</fieldset>
      <label className="field"><span>Details{reason === "OTHER" ? "" : " (optional)"}</span><textarea name="details" rows={3} maxLength={1000} required={reason === "OTHER"} placeholder="Which Beat, and what should change?" /></label>
      {chosen && <p className="muted-copy" role="status">{chosen.autoHide ? "This hides the share right away while our team reviews it." : "The share stays visible while our team reviews it."}</p>}
      <FormSubmitButton label="Send report" pendingLabel="Sending…" />
    </ActionForm>
  </Sheet>;
}

export function AddFromMarketplaceForm({ listingId, fingerprint, defaultName, kind, canEdit }: { listingId: string; fingerprint: string; defaultName: string; kind: "MIX" | "MEGA_MIX"; canEdit: boolean }) {
  if (!canEdit) return <p className="muted-copy">Only the account owner can add from the Marketplace.</p>;
  return <ActionForm action={addFromMarketplaceAction} className="form-stack">
    <input type="hidden" name="listingId" value={listingId} /><input type="hidden" name="fingerprint" value={fingerprint} />
    <label className="field"><span>{kind === "MIX" ? "Mix name" : "Mega-Mix name"}</span><input name="name" required maxLength={80} defaultValue={defaultName} /></label>
    <label className="checkbox-label"><input type="checkbox" name="reviewed" required />I’ve reviewed the wording. It becomes my own copy; it starts no one and sends nothing until I start someone.</label>
    <FormSubmitButton label="Add to my account" pendingLabel="Adding…" />
  </ActionForm>;
}
