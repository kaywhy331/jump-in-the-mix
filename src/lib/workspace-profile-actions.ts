"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string, maxLength = 2000): string {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

function optionalHttpsUrl(formData: FormData, key: string, label: string): string | null {
  const raw = value(formData, key, 500);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    redirect(`/settings?error=${encodeURIComponent(`${label} must be a valid https URL.`)}#community-profile`);
  }
  if (url.protocol !== "https:") {
    redirect(`/settings?error=${encodeURIComponent(`${label} must use https.`)}#community-profile`);
  }
  return url.toString();
}

export async function updateWorkspaceProfileAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  if (impersonation) redirect(`/settings?error=${encodeURIComponent("Administrator support sessions are view-only.")}`);
  const existingContributor = await prisma.sharedMixContributorProfile.findUnique({ where: { workspaceId: workspace.id } });
  const contributorEnabled = formData.get("communityProfileEnabled") === "on";
  const contributorDisplayName = value(formData, "communityDisplayName", 120) || null;
  if (contributorEnabled && !contributorDisplayName) {
    redirect(`/settings?error=${encodeURIComponent("Add a Community display name before making the profile public.")}#community-profile`);
  }

  const contributorWebsite = optionalHttpsUrl(formData, "communityWebsite", "Community website");
  const workspaceData = {
    company: value(formData, "company", 200) || null,
    industry: value(formData, "industry", 160) || null,
    website: optionalHttpsUrl(formData, "website", "Website"),
    phone: value(formData, "phone", 80) || null,
    street: value(formData, "street", 200) || null,
    city: value(formData, "city", 120) || null,
    state: value(formData, "state", 120) || null,
    postalCode: value(formData, "postalCode", 40) || null,
    mailingAddress: value(formData, "mailingAddress", 400) || null,
    product1: value(formData, "product1", 200) || null,
    product2: value(formData, "product2", 200) || null,
    product3: value(formData, "product3", 200) || null,
    product4: value(formData, "product4", 200) || null,
    product5: value(formData, "product5", 200) || null,
    myCustom1: value(formData, "myCustom1", 500) || null,
    myCustom2: value(formData, "myCustom2", 500) || null,
    myCustom3: value(formData, "myCustom3", 500) || null,
    smsSignature: value(formData, "smsSignature", 500) || null,
    emailSignature: value(formData, "emailSignature", 2000) || null,
    timezone: value(formData, "timezone", 120) || "America/New_York"
  };
  const contributorData = {
    enabled: contributorEnabled,
    displayName: contributorDisplayName,
    title: value(formData, "communityTitle", 160) || null,
    bio: value(formData, "communityBio", 500) || null,
    avatarUrl: optionalHttpsUrl(formData, "communityAvatarUrl", "Profile image"),
    website: contributorWebsite
  };
  const reviewRequired = Boolean(
    (contributorWebsite && contributorWebsite !== existingContributor?.website)
    || (existingContributor?.enabled && !contributorEnabled)
  );
  const approvedShares = reviewRequired
    ? await prisma.sharedMixMetadata.findMany({
        where: {
          publisherWorkspaceId: workspace.id,
          isPlatform: false,
          reviewState: "APPROVED"
        },
        select: { sharedMixId: true }
      })
    : [];
  const affectedSharedMixIds = approvedShares.map((item) => item.sharedMixId);

  await prisma.$transaction(async (tx) => {
    await tx.workspaceProfile.upsert({
      where: { workspaceId: workspace.id },
      create: { workspaceId: workspace.id, ...workspaceData, onboardingDone: true },
      update: workspaceData
    });
    await tx.sharedMixContributorProfile.upsert({
      where: { workspaceId: workspace.id },
      create: { workspaceId: workspace.id, ...contributorData },
      update: contributorData
    });
    if (affectedSharedMixIds.length) {
      await tx.sharedMixMetadata.updateMany({
        where: { sharedMixId: { in: affectedSharedMixIds } },
        data: {
          reviewState: "FLAGGED",
          moderationNote: contributorEnabled
            ? "The contributor website changed and requires administrator review."
            : "The contributor disabled their public profile.",
          reviewedAt: null,
          reviewedByUserId: null
        }
      });
      await tx.sharedMix.updateMany({
        where: { id: { in: affectedSharedMixIds } },
        data: { status: "PENDING" }
      });
      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          actorType: "USER",
          actorUserId: user.id,
          action: "shared-mix.profile-review-required",
          entityType: "SharedMixContributorProfile",
          entityId: workspace.id,
          source: "settings.community-profile",
          metadata: { affectedSharedMixIds, websiteChanged: contributorWebsite !== existingContributor?.website, profileDisabled: !contributorEnabled }
        }
      });
    }
  });
  redirect(`/settings?saved=1${affectedSharedMixIds.length ? "&communityReview=1" : ""}`);
}
