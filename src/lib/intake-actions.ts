"use server";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { withViewerError } from "@/lib/form-errors";
import { prisma } from "@/lib/prisma";
import { createConnectionToken } from "@/lib/connection-tokens";
import { INTAKE_KINDS } from "@/lib/intake-types";
import { IntakeError, resolveIntake } from "@/lib/intake";
import { placeableMixWhere } from "@/lib/new-contact-placement";
const value = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
/** A connection change or inquiry decision this page refuses; its message is shown as written. */
class ConnectionActionError extends Error {}
export async function intakeConnectionAction(data: FormData) {
  const { workspace, user, session, impersonation } = await requireWorkspace(); if (impersonation) throw new Error("Support sessions are view-only.");
  let selected = value(data, "id");
  try {
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Workspace" WHERE id = ${workspace.id} FOR NO KEY UPDATE`;
      const intent = value(data, "intent");
      if (intent === "create") {
        const name = value(data, "name"), kind = value(data, "kind");
        if (!name || name.length > 100 || !INTAKE_KINDS.some(item => item.value === kind)) throw new ConnectionActionError("Give your connection a name and choose a source.");
        if (await tx.intakeConnection.count({ where: { workspaceId: workspace.id } }) >= 50) throw new ConnectionActionError("This business has reached its limit of 50 lead connections.");
        selected = (await tx.intakeConnection.create({ data: { workspaceId: workspace.id, name, kind, ...createConnectionToken() } })).id;
      } else {
        const connection = await tx.intakeConnection.findFirst({ where: { id: selected, workspaceId: workspace.id } });
        if (!connection) throw new ConnectionActionError("Connection not found.");
        if (intent === "rotate") await tx.intakeConnection.update({ where: { id: selected }, data: createConnectionToken() });
        else if (intent === "toggle") await tx.intakeConnection.update({ where: { id: selected }, data: { enabled: value(data, "enabled") === "true" } });
        else if (intent === "placement") {
          // Where this connection's new people go (JITM-09 §2.78): the New contacts setting, a Mix of its own, or none.
          const choice = value(data, "newContactMix");
          if (choice && choice !== "none" && choice !== connection.newContactMixId && !await tx.mix.findFirst({ where: { id: choice, ...placeableMixWhere(workspace.id) }, select: { id: true } })) throw new ConnectionActionError("Choose a Mix that is on and starts when you start it for someone.");
          await tx.intakeConnection.update({ where: { id: selected }, data: !choice ? { newContactPlacement: null, newContactMixId: null } : choice === "none" ? { newContactPlacement: "NONE", newContactMixId: null } : { newContactPlacement: "MIX", newContactMixId: choice } });
        }
        else throw new ConnectionActionError("Choose a connection action.");
      }
      await tx.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: `intake.connection.${intent}`, entityType: "IntakeConnection", entityId: selected, source: "settings.connections" } });
    });
  } catch (error) { redirect(withViewerError("/settings/connections", error instanceof ConnectionActionError ? error.message : "The connection could not be saved.", session)); }
  redirect(`/settings/connections?selected=${encodeURIComponent(selected)}&saved=1`);
}

export async function reviewIntakeAction(data: FormData) {
  const { workspace, user, session, impersonation } = await requireWorkspace(); if (impersonation) throw new Error("Support sessions are view-only.");
  try {
    const decision = value(data, "decision");
    if (!["ignore","create","link"].includes(decision)) throw new ConnectionActionError("Choose how to handle this inquiry.");
    await resolveIntake(workspace.id, value(data, "receiptId"), decision as "ignore" | "create" | "link", value(data, "contactId"), user.id);
  } catch (error) { redirect(`${withViewerError("/settings/connections", error instanceof ConnectionActionError || error instanceof IntakeError ? error.message : "The inquiry could not be reviewed.", session)}#needs-review`); }
  redirect("/settings/connections?saved=1#needs-review");
}
