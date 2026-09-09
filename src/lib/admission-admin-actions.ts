"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { AdmissionError } from "@/lib/admission";
import { changeAdmissionPolicy } from "@/lib/admission-admin";

export async function changeAdmissionPolicyAction(formData: FormData): Promise<void> {
  const { user, session } = await requirePlatformAdmin("settings.manage");
  const rate = await consumeRateLimit({ scope: "admin.admission", identifiers: [user.id], limit: 10, windowMs: 15 * 60_000 });
  if (!rate.allowed) redirect("/admin/admission?error=Too+many+attempts.+Try+again+in+15+minutes.");
  const number = (key: string) => /^\d+$/.test(String(formData.get(key) ?? "")) ? Number(formData.get(key)) : NaN;
  let revision: number;
  try {
    const updated = await changeAdmissionPolicy({ actorUserId: user.id, actorSessionId: session.id,
      password: String(formData.get("currentPassword") ?? ""), reason: String(formData.get("reason") ?? ""), expectedRevision: number("revision"),
      configuration: { accountCeiling: number("accountCeiling"), outstandingCeiling: number("outstandingCeiling"),
        collectionPaused: formData.get("collectionPaused") === "on", grantsPaused: formData.get("grantsPaused") === "on",
        referralsPaused: formData.get("referralsPaused") === "on", redemptionPaused: formData.get("redemptionPaused") === "on" }
    });
    revision = updated.revision;
  } catch (error) {
    if (error instanceof AdmissionError) {
      if (error.needsMfa) redirect("/account/admin-mfa?verify=1&returnTo=%2Fadmin%2Fadmission");
      redirect(`/admin/admission?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }
  revalidatePath("/admin", "layout"); revalidatePath("/mixes/system"); revalidatePath("/register"); revalidatePath("/waitlist"); revalidatePath("/");
  redirect(`/admin/admission?saved=${revision}`);
}
