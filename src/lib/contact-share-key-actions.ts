"use server";
import { requireWorkspace } from "@/lib/auth";
import { removeContactShareKey, replaceContactShareKey } from "@/lib/contact-share-keys";
import { prisma } from "@/lib/prisma";

export type ContactShareKeyResult = { key?: string; removed?: boolean; error?: string };

async function owner() {
  const { workspace, user, impersonation } = await requireWorkspace();
  if (impersonation) return { error: "Support sessions are view-only." };
  // Adding people in bulk is the owner's, as for Quick Add and import (commitContactImportBatch).
  if (workspace.ownerId !== user.id) return { error: "Only the account owner can add people from a phone." };
  return { workspaceId: workspace.id, userId: user.id };
}

// The key change has already happened; a failed audit write must not hide the new key from its owner.
async function audit(workspaceId: string, userId: string, action: string) {
  await prisma.auditLog.create({ data: { workspaceId, actorType: "USER", actorUserId: userId, action, entityType: "ContactShareKey", source: "contacts.from-phone" } })
    .catch(() => console.error("Phone contact key audit failed", action));
}

/** A new key for the iPhone shortcut, returned once. Any earlier key stops working. */
export async function makeContactShareKeyAction(): Promise<ContactShareKeyResult> {
  const account = await owner();
  if ("error" in account) return { error: account.error };
  const key = await replaceContactShareKey(account.workspaceId, account.userId);
  await audit(account.workspaceId, account.userId, "contact.share-key.create");
  return { key };
}

export async function removeContactShareKeyAction(): Promise<ContactShareKeyResult> {
  const account = await owner();
  if ("error" in account) return { error: account.error };
  await removeContactShareKey(account.workspaceId, account.userId);
  await audit(account.workspaceId, account.userId, "contact.share-key.remove");
  return { removed: true };
}
