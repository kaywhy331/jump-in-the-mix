"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function records(formData: FormData, key: string, maximum: number): { name: string; value: string }[] {
  try {
    const parsed = JSON.parse(value(formData, key, 20_000));
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, maximum).map((item) => ({ name: String(item?.name ?? "").trim().slice(0, 120), value: String(item?.value ?? "").trim().slice(0, 500) })).filter((item) => item.name || item.value);
  } catch { return []; }
}

function value(formData: FormData, key: string, maxLength = 2000): string {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

function optionalHttpsUrl(formData: FormData, key: string, label: string, section = "business"): string | null {
  const raw = value(formData, key, 500);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    const path = section === "business" ? "/settings/business" : `/settings?section=${section}`;
    redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(`${label} must be a valid https URL.`)}`);
  }
  if (url.protocol !== "https:") {
    const path = section === "business" ? "/settings/business" : `/settings?section=${section}`;
    redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(`${label} must use https.`)}`);
  }
  return url.toString();
}

export async function updateWorkspaceProfileAction(formData: FormData): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  const section = value(formData, "settingsSection", 40) || "all";
  const editsBusiness = section === "business" || section === "profile" || section === "all";
  const editsMessaging = section === "business" || section === "messaging" || section === "all";
  if (impersonation) redirect(`/settings?error=${encodeURIComponent("Administrator support sessions are view-only.")}`);
  const legacyProducts = [workspace.profile?.product1, workspace.profile?.product2, workspace.profile?.product3, workspace.profile?.product4, workspace.profile?.product5].flatMap((item, index) => item ? [{ name: `Product or service ${index + 1}`, value: item }] : []);
  const legacyDetails = [workspace.profile?.myCustom1, workspace.profile?.myCustom2, workspace.profile?.myCustom3].flatMap((item, index) => item ? [{ name: `Sender detail ${index + 1}`, value: item }] : []);
  const productRecords = editsBusiness ? records(formData, "products", section === "business" ? 5 : 20) : (workspace.profile?.products as { name: string; value: string }[] | null) ?? legacyProducts;
  const senderDetails = section === "profile" || section === "all" ? records(formData, "senderDetails", 20) : (workspace.profile?.senderDetails as { name: string; value: string }[] | null) ?? legacyDetails;
  const company = editsBusiness ? value(formData, "company", 200) : workspace.profile?.company ?? null;
  if (section === "business" && !company) redirect(`/settings/business?error=${encodeURIComponent("Enter your business name.")}`);
  const workspaceData = {
    company: company || null,
    industry: editsBusiness ? value(formData, "industry", 160) || null : workspace.profile?.industry ?? null,
    website: editsBusiness ? optionalHttpsUrl(formData, "website", "Website", section === "business" ? "business" : "profile") : workspace.profile?.website ?? null,
    reviewUrl: editsBusiness ? optionalHttpsUrl(formData, "reviewUrl", "Public review page", section === "business" ? "business" : "profile") : workspace.profile?.reviewUrl ?? null,
    phone: editsBusiness ? value(formData, "phone", 80) || null : workspace.profile?.phone ?? null,
    street: section === "profile" || section === "all" ? value(formData, "street", 200) || null : workspace.profile?.street ?? null,
    city: section === "profile" || section === "all" ? value(formData, "city", 120) || null : workspace.profile?.city ?? null,
    state: section === "profile" || section === "all" ? value(formData, "state", 120) || null : workspace.profile?.state ?? null,
    postalCode: section === "profile" || section === "all" ? value(formData, "postalCode", 40) || null : workspace.profile?.postalCode ?? null,
    mailingAddress: section === "profile" || section === "all" ? value(formData, "mailingAddress", 400) || null : workspace.profile?.mailingAddress ?? null,
    product1: productRecords[0]?.value || null,
    product2: productRecords[1]?.value || null,
    product3: productRecords[2]?.value || null,
    product4: productRecords[3]?.value || null,
    product5: productRecords[4]?.value || null,
    myCustom1: senderDetails[0]?.value || null,
    myCustom2: senderDetails[1]?.value || null,
    myCustom3: senderDetails[2]?.value || null,
    products: productRecords,
    senderDetails,
    smsSignature: editsMessaging ? value(formData, "smsSignature", 500) || user.name : workspace.profile?.smsSignature ?? null,
    emailSignature: editsMessaging ? value(formData, "emailSignature", 2000) || user.name : workspace.profile?.emailSignature ?? null
  };
  await prisma.workspaceProfile.upsert({
    where: { workspaceId: workspace.id },
    create: { workspaceId: workspace.id, ...workspaceData, onboardingDone: true },
    update: workspaceData
  });
  if (section === "business") redirect("/settings/business?saved=1");
  redirect(`/settings?section=${section === "all" ? "profile" : section}&saved=1`);
}
