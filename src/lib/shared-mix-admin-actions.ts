"use server";

import type { MixTriggerMode, SharedMixReviewState, SharedMixStatus } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeSharedMixChannel, type SharedMixStep } from "@/lib/shared-mix";
import { createOrRefreshPlatformSharedMix, updateSharedMixAsAdmin } from "@/lib/shared-mix-service";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function values(formData: FormData, key: string): string[] {
  return formData.getAll(key).map((item) => String(item));
}

function fail(path: string, message: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
}

function publicStatus(reviewState: SharedMixReviewState): SharedMixStatus {
  if (reviewState === "APPROVED") return "APPROVED";
  if (reviewState === "REJECTED") return "REJECTED";
  if (reviewState === "UNPUBLISHED") return "UNPUBLISHED";
  return "PENDING";
}

async function adminContext() {
  const { user } = await requirePlatformAdmin();
  const membership = user.memberships[0];
  if (!membership) fail("/admin/templates", "A platform administrator workspace is required for audited template changes.");
  return { user, workspaceId: membership.workspaceId };
}

export async function createPlatformSharedMixAction(formData: FormData): Promise<void> {
  const { user, workspaceId } = await adminContext();
  const sourceMixId = value(formData, "sourceMixId");
  if (!sourceMixId) fail("/admin/templates", "Choose one of your workspace Mixes as the source.");
  try {
    const sharedMixId = await createOrRefreshPlatformSharedMix({
      sourceWorkspaceId: workspaceId,
      actorUserId: user.id,
      sourceMixId,
      metadata: {
        title: value(formData, "title"),
        description: value(formData, "description"),
        category: value(formData, "category"),
        industry: value(formData, "industry"),
        framework: value(formData, "framework") || null
      }
    });
    redirect(`/admin/templates/${sharedMixId}/edit?created=1`);
  } catch (error) {
    fail("/admin/templates", error instanceof Error ? error.message : "The platform Mix Template could not be created.");
  }
}

export async function quickModerateSharedMixAction(formData: FormData): Promise<void> {
  const { user, workspaceId } = await adminContext();
  const sharedMixId = value(formData, "sharedMixId");
  const reviewState = value(formData, "status") as SharedMixReviewState;
  const allowed: SharedMixReviewState[] = ["PENDING", "APPROVED", "REJECTED", "UNPUBLISHED", "FLAGGED"];
  if (!sharedMixId || !allowed.includes(reviewState)) fail("/admin/templates", "Choose a valid Mix Template moderation action.");
  const shared = await prisma.sharedMix.findUnique({
    where: { id: sharedMixId },
    select: { id: true, status: true, publisherWorkspaceId: true, createdAt: true }
  });
  if (!shared) fail("/admin/templates", "Mix Template not found.");
  const now = new Date();
  await prisma.$transaction([
    prisma.sharedMix.update({ where: { id: shared.id }, data: { status: publicStatus(reviewState) } }),
    prisma.sharedMixMetadata.upsert({
      where: { sharedMixId: shared.id },
      create: {
        sharedMixId: shared.id,
        publisherWorkspaceId: shared.publisherWorkspaceId,
        isPlatform: shared.publisherWorkspaceId === null,
        reviewState,
        publishedAt: reviewState === "APPROVED" ? now : shared.status === "APPROVED" ? shared.createdAt : null,
        reviewedAt: now,
        reviewedByUserId: user.id,
        moderationNote: value(formData, "moderationNote") || null
      },
      update: {
        reviewState,
        publishedAt: reviewState === "APPROVED" ? now : undefined,
        reviewedAt: now,
        reviewedByUserId: user.id,
        moderationNote: value(formData, "moderationNote") || null
      }
    }),
    prisma.auditLog.create({
      data: {
        workspaceId,
        actorType: "ADMIN",
        actorUserId: user.id,
        action: "shared-mix.moderate.quick",
        entityType: "SharedMix",
        entityId: shared.id,
        source: "admin.templates",
        metadata: { reviewState, publisherWorkspaceId: shared.publisherWorkspaceId }
      }
    })
  ]);
  redirect(`/admin/templates?moderated=${reviewState.toLowerCase()}`);
}

export async function saveSharedMixAdminAction(formData: FormData): Promise<void> {
  const { user, workspaceId } = await adminContext();
  const sharedMixId = value(formData, "sharedMixId");
  const path = sharedMixId ? `/admin/templates/${sharedMixId}/edit` : "/admin/templates";
  if (!sharedMixId) fail("/admin/templates", "Choose a Mix Template.");

  const names = values(formData, "stepName");
  const channels = values(formData, "stepChannel");
  const offsets = values(formData, "stepDayOffset");
  const times = values(formData, "stepSendTimeMinutes");
  const subjects = values(formData, "stepSubject");
  const bodies = values(formData, "stepBody");
  const scripts = values(formData, "stepScript");
  if (!names.length) fail(path, "Keep at least one Jump in the Mix Template.");

  const steps: SharedMixStep[] = names.map((name, index) => {
    const channel = normalizeSharedMixChannel(channels[index]);
    if (!channel) fail(path, `Jump #${index + 1} does not use a supported channel.`);
    const offset = Number(offsets[index]);
    const parsedTime = Number(times[index]);
    const body = (bodies[index] ?? "").trim() || null;
    return {
      name: name.trim(),
      channel,
      dayOffset: Number.isInteger(offset) ? offset : 0,
      sendTimeMinutes: Number.isInteger(parsedTime) && parsedTime >= 0 && parsedTime <= 1439 ? parsedTime : null,
      subject: (subjects[index] ?? "").trim() || null,
      body,
      script: (scripts[index] ?? "").trim() || null,
      longSms: channel === "SMS" && (body?.length ?? 0) > 160,
      includeOptOut: false
    };
  });

  const triggerMode = value(formData, "triggerMode") as MixTriggerMode;
  const allowedTriggers: MixTriggerMode[] = ["DATE_TRIGGERED", "MANUAL_START", "BROADCAST"];
  if (!allowedTriggers.includes(triggerMode)) fail(path, "Choose a valid Mix trigger mode.");
  const reviewState = value(formData, "status") as SharedMixReviewState;
  try {
    await updateSharedMixAsAdmin({
      actorUserId: user.id,
      auditWorkspaceId: workspaceId,
      sharedMixId,
      metadata: {
        title: value(formData, "title"),
        description: value(formData, "description"),
        category: value(formData, "category"),
        industry: value(formData, "industry"),
        framework: value(formData, "framework") || null
      },
      reviewState,
      triggerMode,
      dateTypeName: value(formData, "dateTypeName") || null,
      dateTypeSlug: value(formData, "dateTypeSlug") || null,
      steps,
      moderationNote: value(formData, "moderationNote") || null,
      featured: formData.get("featured") === "on"
    });
    redirect(`${path}?saved=1`);
  } catch (error) {
    fail(path, error instanceof Error ? error.message : "The Mix Template could not be saved.");
  }
}
