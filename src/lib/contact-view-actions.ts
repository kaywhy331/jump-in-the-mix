"use server";

import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { requireWorkspace } from "@/lib/auth";
import { withViewerError, type ErrorViewer } from "@/lib/form-errors";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string, maximum = 200): string {
  return String(formData.get(key) ?? "").trim().slice(0, maximum);
}

function fail(message: string, viewer: ErrorViewer): never {
  redirect(withViewerError("/contacts", message, viewer));
}

export async function saveContactViewAction(formData: FormData): Promise<void> {
  const { user, workspace, session, impersonation } = await requireWorkspace();
  if (impersonation) fail("View-only support sessions cannot change saved views.", session);
  const name = value(formData, "name", 80);
  const q = value(formData, "q", 160);
  const group = value(formData, "group", 120);
  const priority = value(formData, "priority", 40);
  const permission = value(formData, "permission", 40);
  if (!name) fail("Give the saved view a name.", session);
  const sort = ["last-name", "updated", "newest"].includes(value(formData, "sort", 20)) ? value(formData, "sort", 20) : "name";
  const query = { sort, q: q || null, group: group || null, priority: priority || null, permission: permission || null } satisfies Prisma.InputJsonObject;
  const saved = await prisma.contactSavedView.upsert({
    where: { userId_workspaceId_name: { userId: user.id, workspaceId: workspace.id, name } },
    create: { userId: user.id, workspaceId: workspace.id, name, query },
    update: { query }
  });
  redirect(`/contacts?view=${encodeURIComponent(saved.id)}&viewSaved=1`);
}

export async function setDefaultContactViewAction(formData: FormData): Promise<void> {
  const { user, workspace, session, impersonation } = await requireWorkspace();
  if (impersonation) fail("View-only support sessions cannot change saved views.", session);
  const viewId = value(formData, "viewId", 120);
  const view = await prisma.contactSavedView.findFirst({ where: { id: viewId, userId: user.id, workspaceId: workspace.id } });
  if (!view) fail("Saved view not found.", session);
  await prisma.$transaction([
    prisma.contactSavedView.updateMany({ where: { userId: user.id, workspaceId: workspace.id, isDefault: true }, data: { isDefault: false } }),
    prisma.contactSavedView.update({ where: { id: view.id }, data: { isDefault: true } })
  ]);
  redirect(`/contacts?view=${encodeURIComponent(view.id)}&defaultViewSaved=1`);
}

export async function deleteContactViewAction(formData: FormData): Promise<void> {
  const { user, workspace, session, impersonation } = await requireWorkspace();
  if (impersonation) fail("View-only support sessions cannot change saved views.", session);
  const viewId = value(formData, "viewId", 120);
  await prisma.contactSavedView.deleteMany({ where: { id: viewId, userId: user.id, workspaceId: workspace.id } });
  redirect("/contacts?viewDeleted=1");
}
