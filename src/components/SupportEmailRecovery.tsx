import { FormSubmitButton } from "@/components/FormSubmitButton";
import { adminCancelSupportEmailAction, adminRecoverSupportEmailAction, adminRepeatSupportEmailAction, adminRetrySupportEmailAction } from "@/lib/support-admin-actions";

type Delivery = { id: string; generation: number; status: string; attempts: number; updatedAt: Date; createdAt: Date; firstAttemptAt: Date | null; availableAt: Date; hasFrozenContent: boolean };

export function SupportEmailRecovery({ ticketId, delivery, canManageEmail }: { ticketId: string; delivery: Delivery; canManageEmail: boolean }) {
  const fields = <><input type="hidden" name="ticketId" value={ticketId} /><input type="hidden" name="deliveryId" value={delivery.id} /><input type="hidden" name="expectedUpdatedAt" value={delivery.updatedAt.toISOString()} /></>;
  const repeatReady = Date.now() - Math.max(delivery.createdAt.getTime(), delivery.firstAttemptAt?.getTime() ?? 0) >= 24 * 3600_000;
  return <div className="form-stack">
    {delivery.status === "QUEUED" && <small>The existing worker will process this notification when email capacity is available.</small>}
    {delivery.status === "SENDING" && <small>The worker is checking provider acceptance. A stopped worker’s lease can recover automatically.</small>}
    {delivery.status === "CANCELED" && <small>No further email is queued. This does not retract an email already accepted by the provider.</small>}
    {delivery.status === "REVIEW" && <details>
      <summary>Review this email notification</summary>
      <p>The response remains in the customer’s ticket. Checking a receipt makes no send request. Retrying uses the same saved email and key within its original retry window.</p>
      {!delivery.hasFrozenContent && <p>This notification has no saved original content and key. Check the provider history, close this review, and add a new response if the customer still needs an email.</p>}
      <form action={adminRetrySupportEmailAction} className="form-stack">
        {fields}
        <label className="field"><span className="field-label">Review reason</span><textarea name="reason" minLength={10} maxLength={500} required rows={2} /></label>
        {canManageEmail && delivery.hasFrozenContent && <label className="field"><span className="field-label">Provider email record ID (optional)</span><input name="providerId" maxLength={200} /><small>Used only by Check acceptance receipt. Leave blank to check the local ledger.</small></label>}
        <div className="form-actions">
          {delivery.hasFrozenContent && <><FormSubmitButton formAction={adminRecoverSupportEmailAction} label="Check acceptance receipt" pendingLabel="Checking…" /><FormSubmitButton label="Queue same email again" pendingLabel="Queueing…" /></>}
          <FormSubmitButton formAction={adminCancelSupportEmailAction} label="Close without another email" pendingLabel="Saving…" />
        </div>
      </form>
    </details>}
    {canManageEmail && delivery.hasFrozenContent && ["REVIEW", "SENT"].includes(delivery.status) && <details>
      <summary>Approve a replacement notification</summary>
      <p>This queues another email with the same recipient and content. The customer may receive a duplicate. Use it only after checking the provider history and confirming the customer wants another notification.</p>
      {!repeatReady ? <p>Available 24 hours after this notification began. Check its receipt or use its original retry first.</p> : <form action={adminRepeatSupportEmailAction} className="form-stack">
        {fields}
        <label className="field"><span className="field-label">Reason for another email</span><textarea name="reason" minLength={10} maxLength={500} required rows={2} /></label>
        <label className="field"><span className="field-label">Provider investigation reference</span><input name="providerReference" minLength={5} maxLength={200} required /></label>
        <label className="field"><span className="field-label">Customer request reference</span><input name="requestReference" minLength={5} maxLength={200} required /></label>
        <label><input type="checkbox" name="providerReviewed" required /> I checked the provider history.</label>
        <label><input type="checkbox" name="recipientRequested" required /> The customer requested another notification.</label>
        <label><input type="checkbox" name="duplicateRiskAccepted" required /> I understand another copy may arrive.</label>
        <label className="field"><span className="field-label">Current administrator password</span><input name="password" type="password" autoComplete="current-password" maxLength={72} required /></label>
        <small>A current MFA check is required when administrator MFA is enabled.</small>
        <FormSubmitButton label="Approve replacement email" pendingLabel="Saving approval…" />
      </form>}
    </details>}
  </div>;
}
