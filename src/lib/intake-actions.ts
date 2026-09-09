"use server";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createConnectionToken } from "@/lib/connection-tokens";
import { INTAKE_KINDS } from "@/lib/intake-types";
import { resolveIntake } from "@/lib/intake";
const value = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
export async function intakeConnectionAction(data: FormData) {
  const { workspace, user, impersonation } = await requireWorkspace(); if (impersonation) throw new Error("Support sessions are view-only.");
  let selected = value(data, "id");
  try {
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspace.id} FOR NO KEY UPDATE`;
      const intent = value(data, "intent");
      if (intent === "create") {
        const name = value(data, "name"), kind = value(data, "kind");
        if (!name || name.length > 100 || !INTAKE_KINDS.some(item => item.value === kind)) throw new Error("Give your connection a name and choose a source.");
        if (await tx.intakeConnection.count({ where: { workspaceId: workspace.id } }) >= 50) throw new Error("This business has reached its limit of 50 lead connections.");
        selected = (await tx.intakeConnection.create({ data: { workspaceId: workspace.id, name, kind, ...createConnectionToken() } })).id;
      } else {
        const connection = await tx.intakeConnection.findFirst({ where: { id: selected, workspaceId: workspace.id } });
        if (!connection) throw new Error("Connection not found.");
        if (intent === "rotate") await tx.intakeConnection.update({ where: { id: selected }, data: createConnectionToken() });
        else if (intent === "toggle") await tx.intakeConnection.update({ where: { id: selected }, data: { enabled: value(data, "enabled") === "true" } });
        else throw new Error("Choose a connection action.");
      }
      await tx.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: `intake.connection.${intent}`, entityType: "IntakeConnection", entityId: selected, source: "settings.connections" } });
    });
  } catch (error) { redirect(`/settings/connections?error=${encodeURIComponent(error instanceof Error ? error.message : "The connection could not be saved.")}`); }
  redirect(`/settings/connections?selected=${encodeURIComponent(selected)}&saved=1`);
}

export async function reviewIntakeAction(data: FormData) {
  const { workspace, user, impersonation } = await requireWorkspace(); if (impersonation) throw new Error("Support sessions are view-only.");
  try {
    const decision = value(data, "decision");
    if (!["ignore","create","link"].includes(decision)) throw new Error("Choose how to handle this inquiry.");
    await resolveIntake(workspace.id, value(data, "receiptId"), decision as "ignore" | "create" | "link", value(data, "contactId"), user.id);
  } catch (error) { redirect(`/settings/connections?error=${encodeURIComponent(error instanceof Error ? error.message : "The inquiry could not be reviewed.")}#needs-review`); }
  redirect("/settings/connections?saved=1#needs-review");
}
