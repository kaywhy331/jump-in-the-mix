"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { clearRecipientSuppression, EmailReviewError } from "@/lib/email-suppression-admin";
import { recoverInvitationReceipt, repeatInvitationDelivery } from "@/lib/invitation-receipt-recovery";

export async function recoverInvitationReceiptAction(formData: FormData): Promise<void> {
  const { user, session } = await requirePlatformAdmin("email.manage");
  try {
    if (!(await consumeRateLimit({ scope: "admin.email-receipt", identifiers: [user.id], limit: 20, windowMs: 5 * 60_000 })).allowed) throw new EmailReviewError("Too many receipt checks. Please wait five minutes.");
    await recoverInvitationReceipt({ actorUserId: user.id, actorSessionId: session.id, deliveryId: String(formData.get("deliveryId") ?? ""), expectedUpdatedAt: String(formData.get("updatedAt") ?? ""), reason: String(formData.get("reason") ?? ""), ...(formData.has("providerId") ? { providerId: String(formData.get("providerId") ?? "") } : {}) });
  } catch (error) {
    if (error instanceof EmailReviewError && error.needsMfa) redirect("/account/admin-mfa?verify=1&returnTo=%2Fadmin%2Femail%2Frecovery");
    if (error instanceof Error && "digest" in error) throw error;
    redirect(`/admin/email/recovery?error=${encodeURIComponent(error instanceof EmailReviewError ? error.message : "The acceptance receipt could not be recovered.")}`);
  }
  revalidatePath("/admin/email"); revalidatePath("/admin/email/recovery"); revalidatePath("/admin/access"); revalidatePath("/admin/team");
  redirect("/admin/email/recovery?recovered=1");
}

export async function repeatInvitationDeliveryAction(formData: FormData): Promise<void> {
  const { user, session } = await requirePlatformAdmin("email.manage");
  try {
    if (!(await consumeRateLimit({ scope: "admin.email-repeat", identifiers: [user.id], limit: 10, windowMs: 15 * 60_000 })).allowed) throw new EmailReviewError("Too many repeat delivery requests. Please wait 15 minutes.");
    await repeatInvitationDelivery({ actorUserId: user.id, actorSessionId: session.id, deliveryId: String(formData.get("deliveryId") ?? ""), expectedUpdatedAt: String(formData.get("updatedAt") ?? ""), reason: String(formData.get("reason") ?? ""), password: String(formData.get("currentPassword") ?? ""), providerReference: String(formData.get("providerReference") ?? ""), requestReference: String(formData.get("requestReference") ?? ""), providerReviewed: formData.get("providerReviewed") === "on", recipientRequested: formData.get("recipientRequested") === "on", duplicateRiskAccepted: formData.get("duplicateRiskAccepted") === "on" });
  } catch (error) {
    if (error instanceof EmailReviewError && error.needsMfa) redirect("/account/admin-mfa?verify=1&returnTo=%2Fadmin%2Femail%2Frecovery");
    if (error instanceof Error && "digest" in error) throw error;
    redirect(`/admin/email/recovery?error=${encodeURIComponent(error instanceof EmailReviewError ? error.message : "The invitation could not be queued. Reload its review.")}`);
  }
  revalidatePath("/admin/email"); revalidatePath("/admin/email/recovery"); revalidatePath("/admin/access"); revalidatePath("/admin/waitlist"); revalidatePath("/admin/team");
  redirect("/admin/email/recovery?queued=1");
}

export async function clearRecipientSuppressionAction(formData: FormData): Promise<void> {
  const { user, session } = await requirePlatformAdmin("email.manage");
  const id = String(formData.get("suppressionId") ?? "");
  const path = id && id.length <= 100 ? `/admin/email/suppressions/${encodeURIComponent(id)}` : "/admin/email/suppressions";
  try {
    if (!(await consumeRateLimit({ scope: "admin.email-clearance", identifiers: [user.id], limit: 10, windowMs: 15 * 60_000 })).allowed) throw new EmailReviewError("Too many review attempts. Please wait 15 minutes.");
    await clearRecipientSuppression({ actorUserId: user.id, actorSessionId: session.id, suppressionId: id,
      expectedState: String(formData.get("state") ?? ""), password: String(formData.get("currentPassword") ?? ""), reason: String(formData.get("reason") ?? ""),
      providerReference: String(formData.get("providerReference") ?? ""), requestReference: String(formData.get("requestReference") ?? ""),
      providerReviewed: formData.get("providerReviewed") === "on", recipientRequested: formData.get("recipientRequested") === "on" });
  } catch (error) {
    if (error instanceof EmailReviewError && error.needsMfa) redirect(`/account/admin-mfa?verify=1&returnTo=${encodeURIComponent(path)}`);
    if (error instanceof Error && "digest" in error) throw error;
    redirect(`${path}?error=${encodeURIComponent(error instanceof EmailReviewError ? error.message : "Suppression could not be cleared. Reload the review.")}`);
  }
  revalidatePath("/admin/email"); revalidatePath("/admin/email/suppressions"); revalidatePath("/admin/waitlist");
  redirect(`${path}?cleared=1`);
}
