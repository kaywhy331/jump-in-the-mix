"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string, maxLength = 2000): string {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

function optionalUrl(formData: FormData, key: string): string | null {
  const raw = value(formData, key, 500);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    redirect(`/settings?error=${encodeURIComponent("Community website and avatar must be valid https URLs.")}#community-profile`);
  }
  if (url.protocol !== "https:") {
    redirect(`/settings?error=${encodeURIComponent("Community website and avatar must use https.")}#community-profile`);
  }
  return url.toString();
}

export async function updateWorkspaceProfileAction(formData: FormData): Promise<void> {
  const { workspace, impersonation } = await requireWorkspace();
  if (impersonation) redirect(`/settings?error=${encodeURIComponent("Administrator support sessions are view-only.")}`);
  const communityProfileEnabled = formData.get("communityProfileEnabled") === "on";
  const communityDisplayName = value(formData, "communityDisplayName", 120) || null;
  const communityBio = value(formData, "communityBio", 500) || null;
  if (communityProfileEnabled && !communityDisplayName) {
    redirect(`/settings?error=${encodeURIComponent("Add a Community display name before making the profile public.")}#community-profile`);
  }

  const data = {
    company: value(formData, "company", 200) || null,
    industry: value(formData, "industry", 160) || null,
    website: optionalUrl(formData, "website"),
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
    timezone: value(formData, "timezone", 120) || "America/New_York",
    communityProfileEnabled,
    communityDisplayName,
    communityTitle: value(formData, "communityTitle", 160) || null,
    communityBio,
    communityAvatarUrl: optionalUrl(formData, "communityAvatarUrl"),
    communityWebsite: optionalUrl(formData, "communityWebsite")
  };

  await prisma.workspaceProfile.upsert({
    where: { workspaceId: workspace.id },
    create: { workspaceId: workspace.id, ...data, onboardingDone: true },
    update: data
  });
  redirect("/settings?saved=1");
}
