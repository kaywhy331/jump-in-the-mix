"use server";

import { redirect } from "next/navigation";
import { withViewerError } from "@/lib/form-errors";
import { requireWritableWorkspace } from "@/lib/writable-workspace";
import { placeableMixWhere } from "@/lib/new-contact-placement";
import { prisma } from "@/lib/prisma";

const PLACEMENTS = ["NONE", "MIX", "ASK"] as const;

/** Saves where new contacts go (JITM-09 §2.78, D34): leave them out, add them to a chosen Mix, or ask each time. */
export async function saveNewContactPlacementAction(formData: FormData): Promise<void> {
  const { workspace, user, session } = await requireWritableWorkspace((message, viewer) => redirect(withViewerError("/settings/new-contacts", message, viewer)));
  const refuse: (message: string) => never = (message) => redirect(withViewerError("/settings/new-contacts", message, session));
  const placement = PLACEMENTS.find(item => item === String(formData.get("placement") ?? ""));
  if (!placement) refuse("Choose where new contacts go.");
  const mixId = placement === "MIX" ? String(formData.get("mixId") ?? "").trim() : "";
  if (placement === "MIX" && !mixId) refuse("Choose the Mix new contacts start.");
  if (mixId && !await prisma.mix.findFirst({ where: { id: mixId, ...placeableMixWhere(workspace.id) }, select: { id: true } })) refuse("Choose a Mix that is on and starts when you start it for someone.");
  await prisma.$transaction([
    prisma.workspacePreference.upsert({
      where: { workspaceId: workspace.id },
      create: { workspaceId: workspace.id, newContactPlacement: placement, newContactMixId: mixId || null },
      update: { newContactPlacement: placement, newContactMixId: mixId || null }
    }),
    prisma.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: "workspace.new-contact-placement.update", entityType: "Workspace", entityId: workspace.id, source: "settings.new-contacts", metadata: { placement, mixId: mixId || null } } })
  ]);
  redirect("/settings/new-contacts?saved=1");
}
