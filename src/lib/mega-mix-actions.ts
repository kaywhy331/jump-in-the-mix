"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/auth";
import type { FormResult } from "@/lib/form-errors";
import { installMegaMix } from "@/lib/mega-mix-service";
import { megaMixById } from "@/lib/mega-mixes";
import { isValidTimezone } from "@/lib/mix-broadcast";

export async function installMegaMixAction(_previous: FormResult, data: FormData): Promise<FormResult> {
  const { workspace, user, impersonation } = await requireWorkspace();
  if (impersonation) return { error: "Administrator support sessions are view-only." };
  const blueprint = megaMixById(String(data.get("blueprintId") ?? ""));
  if (!blueprint) return { error: "Choose an available mega-mix." };
  if (data.get("reviewed") !== "on") return { error: "Review the included mixes and connections before adding this journey." };
  const onboarding = data.get("onboarding") === "1";
  const timezone = String(data.get("timezone") ?? "");
  if (onboarding && !isValidTimezone(timezone)) return { error: "Choose a valid timezone." };
  try {
    await installMegaMix({ workspaceId: workspace.id, actorUserId: user.id, blueprintId: blueprint.id, expectedVersion: Number(data.get("version")),
      ...(onboarding ? { onboarding: { timezone, company: String(data.get("company") ?? "").trim().slice(0, 200),
        smsSignature: String(data.get("smsSignature") ?? "").trim().slice(0, 160) || user.name, userName: user.name } } : {}) });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The mega-mix could not be added. Your choices have been kept." };
  }
  revalidatePath("/mixes"); revalidatePath("/journey"); revalidatePath("/templates/journeys");
  redirect(`/templates/journeys?journey=${blueprint.id}&added=1`);
}
