"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { PLAN_LIMITS } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function values(formData: FormData, key: string): string[] {
  return formData.getAll(key).map((item) => String(item)).filter(Boolean);
}

function fail(message: string): never {
  redirect(`/settings/jump-date-types?error=${encodeURIComponent(message)}`);
}

export async function createCustomDateTypeAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const name = value(formData, "name");
  if (!name) fail("Give the Jump Date Type a name.");
  const slug = slugify(name);
  if (!slug) fail("Use at least one letter or number in the name.");
  const duplicate = await prisma.dateType.findFirst({
    where: {
      slug,
      OR: [{ workspaceId: workspace.id }, { workspaceId: null }]
    },
    select: { id: true }
  });
  if (duplicate) fail("A system or custom Jump Date Type already uses that name.");
  const activeCount = await prisma.dateType.count({ where: { workspaceId: workspace.id, isSystem: false, isActive: true } });
  const limit = PLAN_LIMITS[workspace.planTier].customDateTypes;
  const isActive = !Number.isFinite(limit) || activeCount < limit;
  await prisma.dateType.create({
    data: {
      workspaceId: workspace.id,
      scopeKey: workspace.id,
      name,
      slug,
      isSystem: false,
      isActive
    }
  });
  redirect(`/settings/jump-date-types?created=1${isActive ? "" : "&inactive=1"}`);
}

export async function renameCustomDateTypeAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const dateTypeId = value(formData, "dateTypeId");
  const name = value(formData, "name");
  if (!name) fail("Give the Jump Date Type a name.");
  const current = await prisma.dateType.findFirst({
    where: { id: dateTypeId, workspaceId: workspace.id, isSystem: false },
    select: { id: true }
  });
  if (!current) fail("Custom Jump Date Type not found.");
  const slug = slugify(name);
  const duplicate = await prisma.dateType.findFirst({
    where: {
      id: { not: current.id },
      slug,
      OR: [{ workspaceId: workspace.id }, { workspaceId: null }]
    },
    select: { id: true }
  });
  if (duplicate) fail("A system or custom Jump Date Type already uses that name.");
  await prisma.dateType.update({ where: { id: current.id }, data: { name, slug } });
  redirect("/settings/jump-date-types?updated=1");
}

export async function saveActiveDateTypesAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const selectedIds = [...new Set(values(formData, "activeDateTypeIds"))];
  const limit = PLAN_LIMITS[workspace.planTier].customDateTypes;
  if (Number.isFinite(limit) && selectedIds.length > limit) {
    fail(`Your ${workspace.planTier.toLowerCase()} plan allows ${limit} active custom Jump Date Types.`);
  }
  const available = selectedIds.length
    ? await prisma.dateType.findMany({ where: { workspaceId: workspace.id, isSystem: false, id: { in: selectedIds } }, select: { id: true } })
    : [];
  if (available.length !== selectedIds.length) fail("One or more selected Jump Date Types are unavailable.");
  await prisma.$transaction([
    prisma.dateType.updateMany({ where: { workspaceId: workspace.id, isSystem: false }, data: { isActive: false } }),
    ...(selectedIds.length ? [prisma.dateType.updateMany({ where: { id: { in: selectedIds }, workspaceId: workspace.id }, data: { isActive: true } })] : [])
  ]);
  await prisma.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: {} } });
  redirect("/settings/jump-date-types?activationSaved=1");
}

export async function deleteCustomDateTypeAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const dateTypeId = value(formData, "dateTypeId");
  const dateType = await prisma.dateType.findFirst({
    where: { id: dateTypeId, workspaceId: workspace.id, isSystem: false },
    select: { id: true }
  });
  if (!dateType) fail("Custom Jump Date Type not found.");
  const [jumpDateCount, mixCount] = await Promise.all([
    prisma.jumpDate.count({ where: { workspaceId: workspace.id, dateTypeId: dateType.id } }),
    prisma.mix.count({ where: { workspaceId: workspace.id, dateTypeId: dateType.id, status: { not: "ARCHIVED" } } })
  ]);
  if (jumpDateCount || mixCount) {
    fail(`This type is still used by ${jumpDateCount} Jump Date${jumpDateCount === 1 ? "" : "s"} and ${mixCount} Mix${mixCount === 1 ? "" : "es"}. Deactivate it instead of deleting it.`);
  }
  await prisma.dateType.delete({ where: { id: dateType.id } });
  redirect("/settings/jump-date-types?deleted=1");
}
