"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { contactMixStatuses } from "@/lib/contact-mix-status";
import { withViewerError } from "@/lib/form-errors";
import { prisma } from "@/lib/prisma";

const value = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

/** The profile or the Contacts list the owner acted from; nothing else is a valid return. */
function returnPath(raw: string, notice: Record<string, string>): string {
  const base = /^\/contacts(\/[A-Za-z0-9_-]{1,120})?(\?[^#]*)?$/.test(raw) ? new URL(raw, "http://local") : new URL("/contacts", "http://local");
  for (const key of ["people", "error", "at", "sig", "mixStarted", "noMixNeeded", "noMixCleared", "noMixSkipped", "noMixPeople", "stateUpdated"]) base.searchParams.delete(key);
  for (const [key, item] of Object.entries(notice)) base.searchParams.set(key, item);
  const query = base.searchParams.toString();
  return `${base.pathname}${query ? `?${query}` : ""}`;
}

/**
 * Confirms that the selected people need no Mix, or takes the confirmation back (JITM-09 §2.76).
 * Confirming is reversible, so it acts at once and its notice offers Undo (JITM-08 §2.5). Only people
 * with No Mix can be confirmed; someone already in a Mix, or marked Do not contact, is left as they are.
 */
export async function setNoMixNeededAction(formData: FormData): Promise<void> {
  const { workspace, user, session, impersonation } = await requireWorkspace();
  const returnTo = value(formData, "returnTo");
  const refuse: (message: string) => never = (message) => redirect(withViewerError(returnPath(returnTo, {}), message, session));
  if (impersonation) refuse("Administrator support sessions are view-only.");
  const confirm = value(formData, "intent") !== "clear";
  const contactIds = [...new Set(formData.getAll("contactIds").map(String).filter(Boolean))];
  if (!contactIds.length) refuse("Select at least one Contact.");
  if (contactIds.length > 100) refuse("Update up to 100 people at a time.");
  const statuses = await contactMixStatuses(workspace.id, contactIds);
  if (statuses.size !== contactIds.length) refuse("One or more selected Contacts are unavailable.");
  const changing = contactIds.filter(id => statuses.get(id) === (confirm ? "no-mix" : "no-mix-needed"));
  const now = new Date();
  if (changing.length) {
    await prisma.$transaction(async (tx) => {
      for (const contactId of changing) {
        await tx.contactRelationshipState.upsert({
          where: { contactId },
          create: { workspaceId: workspace.id, contactId, noMixNeededAt: confirm ? now : null },
          update: { noMixNeededAt: confirm ? now : null }
        });
      }
      await tx.contactActivity.createMany({ data: changing.map(contactId => ({ workspaceId: workspace.id, contactId, actorUserId: user.id, kind: "SYSTEM" as const, visibility: "WORKSPACE" as const, summary: confirm ? "Marked No Mix needed." : "No Mix needed removed.", metadata: { noMixNeeded: confirm } })) });
      await tx.auditLog.create({ data: { workspaceId: workspace.id, actorType: "USER", actorUserId: user.id, action: confirm ? "contact.no-mix-needed.set" : "contact.no-mix-needed.clear", entityType: "Contact", entityId: changing.length === 1 ? changing[0] : workspace.id, source: returnTo.startsWith("/contacts/") ? "contacts.detail" : "contacts.bulk", metadata: { contactIds: changing } } });
    });
  }
  const skipped = contactIds.length - changing.length;
  redirect(returnPath(returnTo, confirm
    ? { noMixNeeded: String(changing.length), ...(changing.length ? { noMixPeople: changing.join(",") } : {}), ...(skipped ? { noMixSkipped: String(skipped) } : {}) }
    : { noMixCleared: String(changing.length) }));
}
