"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdminIdentity } from "@/lib/auth";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { consumeRateLimit } from "@/lib/rate-limit";
import { AdmissionError } from "@/lib/admission";
import { changeAdmissionPolicy } from "@/lib/admission-admin";
import { admissionDraftFields, admissionOperation, type AdmissionDraftState } from "@/lib/admission-draft";
import { clearAdmissionDraft, readAdmissionDraft, writeAdmissionDraft } from "@/lib/admission-draft-cookie";
import { prisma } from "@/lib/prisma";

async function admissionIdentity() {
  const identity = await requirePlatformAdminIdentity();
  if (!hasAdminPermission(identity.staff, "settings.manage")) {
    await prisma.platformAuditEvent.create({ data: { actorUserId: identity.user.id, action: "permission.denied", entityType: "AdminPermission", entityId: "settings.manage", outcome: "DENIED" } });
    redirect("/admin/access-denied");
  }
  return identity;
}

export async function discardAdmissionDraftAction(formData: FormData): Promise<void> {
  const { user, session } = await admissionIdentity();
  const state = await readAdmissionDraft(session.id, user.id);
  if (state?.operation === formData.get("operation")) await clearAdmissionDraft();
  redirect("/admin/admission");
}

export async function changeAdmissionPolicyAction(formData: FormData): Promise<void> {
  // Capture only a non-secret draft before step-up. The service rechecks identity,
  // permission, enabled MFA + its 10-minute freshness, password and revision under locks.
  const { user, session } = await admissionIdentity();
  const operation = formData.get("operation");
  const fields = admissionDraftFields(formData);
  const number = (key: string) => /^\d+$/.test(String(formData.get(key) ?? "")) ? Number(formData.get(key)) : NaN;
  const expectedRevision = number("revision");
  if (!admissionOperation(operation) || !fields || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) redirect("/admin/admission?error=Reload+admission+controls+and+use+a+reason+of+at+most+500+characters.");
  const returnTo = `/admin/admission?draft=${operation}`;
  const fail = (message: string): never => redirect(`${returnTo}&error=${encodeURIComponent(message)}`);
  const prior = await readAdmissionDraft(session.id, user.id);
  if (prior?.kind === "draft" && prior.operation === operation && prior.revision !== expectedRevision && formData.get("reviewedRevision") !== String(expectedRevision)) fail("Review the current saved settings before confirming your draft.");
  const draft: AdmissionDraftState = { kind: "draft", operation, revision: expectedRevision, fields };
  await writeAdmissionDraft(draft, session.id, user.id);
  const rate = await consumeRateLimit({ scope: "admin.admission", identifiers: [user.id], limit: 10, windowMs: 15 * 60_000 });
  if (!rate.allowed) fail("Too many attempts. Try again in 15 minutes.");
  let revision: number;
  try {
    const updated = await changeAdmissionPolicy({ actorUserId: user.id, actorSessionId: session.id,
      password: String(formData.get("currentPassword") ?? ""), reason: fields.reason, expectedRevision,
      configuration: { accountCeiling: number("accountCeiling"), outstandingCeiling: number("outstandingCeiling"),
        collectionPaused: formData.get("collectionPaused") === "on", grantsPaused: formData.get("grantsPaused") === "on",
        referralsPaused: formData.get("referralsPaused") === "on", redemptionPaused: formData.get("redemptionPaused") === "on" }
    });
    revision = updated.revision;
  } catch (error) {
    if (error instanceof AdmissionError) {
      if (error.needsMfa) redirect(`/account/admin-mfa?verify=1&returnTo=${encodeURIComponent(returnTo)}`);
      fail(error.message);
    }
    // Never expose raw database errors or submitted fields in redirects/logs.
    return fail("Admission controls could not be saved. Your draft is retained. Reload and review the saved settings before trying again.");
  }
  await writeAdmissionDraft({ kind: "saved", operation, revision }, session.id, user.id);
  revalidatePath("/admin", "layout"); revalidatePath("/mixes/system"); revalidatePath("/register"); revalidatePath("/waitlist"); revalidatePath("/");
  redirect(`/admin/admission?saved=${revision}&operation=${operation}`);
}
