"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/auth";
import type { FormResult } from "@/lib/form-errors";
import { installMegaMix } from "@/lib/mega-mix-service";
import { megaMixById } from "@/lib/mega-mixes";
import { parseJourneySetup } from "@/lib/journey-preferences";
import { saveJourneySetup } from "@/lib/journey-preference-service";
import { prisma } from "@/lib/prisma";
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
      ...(data.get("tailored") === "1" ? { setup: parseJourneySetup(data) } : {}),
      ...(onboarding ? { onboarding: { timezone, company: String(data.get("company") ?? "").trim().slice(0, 200),
        smsSignature: String(data.get("smsSignature") ?? "").trim().slice(0, 160) || user.name, userName: user.name } } : {}) });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The mega-mix could not be added. Your choices have been kept." };
  }
  revalidatePath("/mixes"); revalidatePath("/journey"); revalidatePath("/templates/journeys");
  redirect(`/templates/journeys?journey=${blueprint.id}&added=1`);
}

export async function saveIndividualMixSetupAction(_previous: FormResult, data: FormData): Promise<FormResult> {
  if (data.get("reviewed") !== "on") return { error: "Review your preferences before continuing." };
  const { workspace, user, impersonation } = await requireWorkspace();
  if (impersonation) return { error: "Administrator support sessions are view-only." };
  try {
    const setup = parseJourneySetup(data);
    await prisma.$transaction(async db => {
      await db.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspace.id} FOR UPDATE`;
      await saveJourneySetup(db, workspace.id, user.id, setup);
      const company = String(data.get("company") ?? "").trim().slice(0, 200);
      const smsSignature = String(data.get("smsSignature") ?? "").trim().slice(0, 160) || user.name;
      const profile = { onboardingDone: true, onboardingStep: 5, primaryGoal: "Choose individual mixes", company: company || null, smsSignature };
      if (company) await db.workspace.update({ where: { id: workspace.id }, data: { name: company } });
      await db.workspaceProfile.upsert({ where: { workspaceId: workspace.id }, create: { workspaceId: workspace.id, ...profile, useCases: ["business"], emailSignature: user.name }, update: profile });
      await db.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "onboarding.individual-mixes", entityType: "Workspace", entityId: workspace.id, source: "onboarding" } });
    });
  } catch (error) { return { error: error instanceof Error ? error.message : "Your preferences could not be saved. Your entries are kept." }; }
  revalidatePath("/account/preferences");
  redirect("/templates?setup=individual");
}

export async function saveJourneyPreferencesAction(_previous: FormResult, data: FormData): Promise<FormResult> {
  const { workspace, user, impersonation } = await requireWorkspace();
  if (impersonation) return { error: "Administrator support sessions are view-only." };
  try {
    const setup = parseJourneySetup(data);
    await prisma.$transaction(async db => {
      await db.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspace.id} FOR UPDATE`;
      await saveJourneySetup(db, workspace.id, user.id, setup);
      await db.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "journey.preferences.update", entityType: "WorkspacePreference", entityId: workspace.id, source: "account.preferences" } });
    });
  } catch (error) { return { error: error instanceof Error ? error.message : "Your preferences could not be saved." }; }
  revalidatePath("/account/preferences"); revalidatePath("/templates/journeys");
  redirect("/account/preferences?journeySaved=1");
}
