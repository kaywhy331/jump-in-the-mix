"use server";
import { captureFormFailure, recoverableFormAction, withViewerError, type ErrorViewer, type FormResult } from "@/lib/form-errors";

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

/** The business page holds this form; the settings hub shows no messages, so every result returns there. */
const BUSINESS_SETTINGS = "/settings/business";

function optionalHttpsUrl(formData: FormData, key: string, label: string, viewer: ErrorViewer): string | null {
  const raw = value(formData, key, 500);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    captureFormFailure(`${label} must be a valid https URL.`);
    redirect(withViewerError(BUSINESS_SETTINGS, `${label} must be a valid https URL.`, viewer));
  }
  if (url.protocol !== "https:") {
    captureFormFailure(`${label} must use https.`);
    redirect(withViewerError(BUSINESS_SETTINGS, `${label} must use https.`, viewer));
  }
  return url.toString();
}

export async function updateWorkspaceProfileAction(formData: FormData): Promise<void> {
  const { workspace, user, session, impersonation } = await requireWorkspace();
  const section = value(formData, "settingsSection", 40) || "all";
  const editsBusiness = section === "business" || section === "profile" || section === "all";
  const editsMessaging = section === "business" || section === "messaging" || section === "all";
  if (impersonation) { captureFormFailure("Administrator support sessions are view-only."); redirect(withViewerError(BUSINESS_SETTINGS, "Administrator support sessions are view-only.", session)); }
  const legacyProducts = [workspace.profile?.product1, workspace.profile?.product2, workspace.profile?.product3, workspace.profile?.product4, workspace.profile?.product5].flatMap((item, index) => item ? [{ name: `Product or service ${index + 1}`, value: item }] : []);
  const legacyDetails = [workspace.profile?.myCustom1, workspace.profile?.myCustom2, workspace.profile?.myCustom3].flatMap((item, index) => item ? [{ name: `Sender detail ${index + 1}`, value: item }] : []);
  const productRecords = editsBusiness ? records(formData, "products", section === "business" ? 5 : 20) : (workspace.profile?.products as { name: string; value: string }[] | null) ?? legacyProducts;
  const senderDetails = section === "profile" || section === "all" ? records(formData, "senderDetails", 20) : (workspace.profile?.senderDetails as { name: string; value: string }[] | null) ?? legacyDetails;
  const company = editsBusiness ? value(formData, "company", 200) : workspace.profile?.company ?? null;
  if (section === "business" && !company) { captureFormFailure("Enter your business name."); redirect(withViewerError(BUSINESS_SETTINGS, "Enter your business name.", session)); }
  const workspaceData = {
    company: company || null,
    industry: editsBusiness ? value(formData, "industry", 160) || null : workspace.profile?.industry ?? null,
    website: editsBusiness ? optionalHttpsUrl(formData, "website", "Website", session) : workspace.profile?.website ?? null,
    reviewUrl: editsBusiness ? optionalHttpsUrl(formData, "reviewUrl", "Public review page", session) : workspace.profile?.reviewUrl ?? null,
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
  redirect(`${BUSINESS_SETTINGS}?saved=1`);
}

export async function updateWorkspaceProfileFormAction(_previous: FormResult, data: FormData): Promise<FormResult> { return recoverableFormAction(() => updateWorkspaceProfileAction(data)); }
