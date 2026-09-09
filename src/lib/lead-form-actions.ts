"use server";
import { getRequestMetadata } from "@/lib/request-context";
import { consumeRateLimit } from "@/lib/rate-limit";
import { receiveIntake, IntakeError } from "@/lib/intake";
import { prisma } from "@/lib/prisma";
import { wakeWorkerAfterResponse } from "@/lib/worker-dispatch-after";
export async function submitLeadFormAction(_state: { error: string; received: boolean }, data: FormData) {
  const value = (name: string) => String(data.get(name) ?? "").trim();
  const connectionId = value("connectionId"); const { ipAddress } = await getRequestMetadata();
  if (value("website")) return { error: "", received: true };
  if (connectionId.length > 120) return { error: "This form is currently unavailable.", received: false };
  const connection = await prisma.intakeConnection.findFirst({ where: { id: connectionId, kind: "HOSTED_FORM", enabled: true }, select: { id: true, workspaceId: true } });
  if (!connection) return { error: "This form is currently unavailable.", received: false };
  const rate = await consumeRateLimit({ scope: "public-lead-form", identifiers: [connectionId, ipAddress], limit: 10, windowMs: 3_600_000 });
  if (!rate.allowed) return { error: "Too many requests. Please try again later.", received: false };
  const overall = await consumeRateLimit({ scope: "public-lead-form-total", identifiers: [connectionId], limit: 300, windowMs: 3_600_000 });
  if (!overall.allowed) return { error: "This form has received many requests. Please try again later.", received: false };
  if (data.get("contactPermission") !== "on") return { error: "Please confirm that the business may contact you about your request.", received: false };
  try {
    await receiveIntake(connectionId, { eventId: value("eventId"), displayName: value("displayName"), email: value("email"), phone: value("phone"), company: value("company"), message: value("message") }, { publicForm: true });
    wakeWorkerAfterResponse(connection.workspaceId);
    // Do not expose whether the supplied email or phone already belongs to a
    // customer, or reveal internal contact/receipt IDs on a public form.
    return { error: "", received: true };
  } catch (error) { return { error: error instanceof IntakeError && error.status === 400 ? error.message : "Your request could not be saved. Please try again later.", received: false }; }
}
