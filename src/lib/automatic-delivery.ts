import { createHash } from "node:crypto";
import type { Channel } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { isQuietTime, notificationClock } from "@/lib/notification-delivery";
import { isValidTimezone } from "@/lib/mix-broadcast";
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendTransactionalEmail, transactionalEmailConfigured } from "@/lib/transactional-email";

const uncertainLeaseMs = 20 * 60_000;
const candidateLimitPerWorkspace = 25;

type PreparedDelivery = { subject: string | null; body: string };

export function automaticEmailConfigured(): boolean {
  return transactionalEmailConfigured();
}

export function automaticSmsConfigured(configuration: Pick<typeof env, "twilioAccountSid" | "twilioAuthToken" | "twilioFromNumber"> = env): boolean {
  return Boolean(configuration.twilioAccountSid.trim() && configuration.twilioAuthToken.trim() && configuration.twilioFromNumber.trim());
}

export function automaticDeliveryEligibleAt(scheduledAt: Date, createdAt: Date, reviewWindowMinutes: number): Date {
  return new Date(Math.max(scheduledAt.getTime(), createdAt.getTime()) + reviewWindowMinutes * 60_000);
}

export function preparedDelivery(snapshot: unknown, channel: Channel): PreparedDelivery | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const value = snapshot as Record<string, unknown>;
  const body = typeof value.body === "string" ? value.body.trim() : "";
  if (!body || (channel !== "EMAIL" && channel !== "SMS")) return null;
  const subject = channel === "EMAIL" && typeof value.subject === "string" && value.subject.trim()
    ? value.subject.trim().slice(0, 300)
    : null;
  return { subject, body };
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s]+/gi, "[database-url-redacted]")
    .replace(/(?:Basic\s+)[A-Za-z0-9+/=]+/gi, "$1[redacted]")
    .slice(0, 1000);
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error ? String(error.code) : "";
}

async function sendTwilioSms(to: string, body: string): Promise<string> {
  if (!automaticSmsConfigured()) throw new Error("Automatic text delivery is not configured.");
  if (body.length > 1600) throw new Error("The prepared text exceeds Twilio's 1,600-character limit.");
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.twilioAccountSid)}/Messages.json`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ To: to, From: env.twilioFromNumber, Body: body }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000)
  });
  const payload = await response.json().catch(() => null) as { sid?: string; message?: string } | null;
  if (!response.ok || !payload?.sid) throw new Error(`Text delivery failed with status ${response.status}${payload?.message ? `: ${payload.message}` : "."}`);
  return payload.sid;
}

async function deliver(channel: Channel, recipient: string, prepared: PreparedDelivery, jumpId: string, company: string): Promise<string | null> {
  if (channel === "SMS") return sendTwilioSms(recipient, prepared.body);
  if (channel !== "EMAIL") throw new Error("Only email and text follow-ups can be sent automatically.");
  if (!automaticEmailConfigured()) throw new Error("Automatic email delivery is not configured.");
  const result = await sendTransactionalEmail({
    to: recipient,
    subject: prepared.subject || `A note from ${company}`,
    text: prepared.body,
    html: `<div style="white-space:pre-wrap;font-family:Arial,sans-serif;line-height:1.6">${escapeHtml(prepared.body)}</div>`,
    idempotencyKey: `automatic-follow-up:${jumpId}`
  });
  return result.providerId;
}

function primaryValue<T extends { isPrimary: boolean }>(values: T[]): T | undefined {
  return values.find((item) => item.isPrimary) ?? values[0];
}

function recipientHash(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase(), "utf8").digest("hex");
}

export async function runAutomaticDeliveries(workerId: string, now = new Date()): Promise<{ attempted: number; delivered: number; failed: number }> {
  await prisma.automatedDelivery.updateMany({
    where: { status: "PROCESSING", lockedAt: { lt: new Date(now.getTime() - uncertainLeaseMs) } },
    data: {
      status: "FAILED",
      lockedAt: null,
      lockedBy: null,
      error: "Delivery result became uncertain after the worker stopped. It was not retried to prevent a duplicate message."
    }
  });

  const preferences = await prisma.automationPreference.findMany({
    where: { enabled: true, OR: [{ emailEnabled: true }, { smsEnabled: true }] }
  });
  let attempted = 0;
  let deliveredCount = 0;
  let failed = 0;

  for (const preference of preferences) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: preference.workspaceId },
      select: {
        id: true,
        name: true,
        ownerId: true,
        owner: { select: { suspendedAt: true } },
        profile: { select: { company: true } }
      }
    });
    if (!workspace?.owner || workspace.owner.suspendedAt) continue;
    const [display, scheduling] = await Promise.all([
      prisma.userPreference.findUnique({ where: { userId: workspace.ownerId } }),
      prisma.workspacePreference.findUnique({ where: { workspaceId: workspace.id } })
    ]);
    const timeZone = isValidTimezone(display?.timezone ?? "") ? display!.timezone : "UTC";
    const clock = notificationClock(now, timeZone);
    if (scheduling && isQuietTime(clock.hour * 60 + clock.minute, scheduling.quietHoursStart, scheduling.quietHoursEnd)) continue;

    const channels: Channel[] = [
      ...(preference.emailEnabled ? ["EMAIL" as const] : []),
      ...(preference.smsEnabled ? ["SMS" as const] : [])
    ];
    const threshold = new Date(now.getTime() - preference.reviewWindowMinutes * 60_000);
    const candidates = await prisma.jump.findMany({
      where: {
        workspaceId: workspace.id,
        status: "PENDING",
        scheduledAt: { lte: threshold },
        stepVersion: { stepTemplate: { channel: { in: channels } } }
      },
      include: {
        contact: { include: { emails: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }, phones: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }, relationshipState: true } },
        stepVersion: { include: { stepTemplate: true } }
      },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      take: candidateLimitPerWorkspace
    });

    for (const jump of candidates) {
      const eligibleAt = automaticDeliveryEligibleAt(jump.scheduledAt, jump.createdAt, preference.reviewWindowMinutes);
      if (eligibleAt > now || jump.contact.relationshipState?.doNotContact) continue;
      const channel = jump.stepVersion.stepTemplate.channel;
      const recipient = channel === "EMAIL"
        ? primaryValue(jump.contact.emails)?.email
        : channel === "SMS" ? primaryValue(jump.contact.phones)?.phone : undefined;
      const prepared = preparedDelivery(jump.renderedSnapshot, channel);
      let deliveryId: string;
      try {
        const claimed = await prisma.automatedDelivery.create({
          data: {
            workspaceId: workspace.id,
            jumpId: jump.id,
            channel,
            status: "PROCESSING",
            reviewEligibleAt: eligibleAt,
            lockedAt: now,
            lockedBy: workerId
          },
          select: { id: true }
        });
        deliveryId = claimed.id;
      } catch (error) {
        if (errorCode(error) === "P2002") continue;
        throw error;
      }
      attempted += 1;

      try {
        if (!recipient) throw new Error(`This customer has no ${channel === "EMAIL" ? "email address" : "phone number"}.`);
        if (!prepared) throw new Error("The prepared message is empty or cannot be sent automatically.");
        const currentPreference = await prisma.automationPreference.findUnique({ where: { workspaceId: workspace.id } });
        const channelStillEnabled = channel === "EMAIL" ? currentPreference?.emailEnabled : currentPreference?.smsEnabled;
        const currentJump = await prisma.jump.findFirst({ where: { id: jump.id, workspaceId: workspace.id, status: "PENDING", workspace: { owner: { suspendedAt: null } } }, select: { id: true } });
        if (!currentPreference?.enabled || !channelStillEnabled || !currentJump) {
          await prisma.automatedDelivery.updateMany({ where: { id: deliveryId, lockedBy: workerId, status: "PROCESSING" }, data: { status: "CANCELED", lockedAt: null, lockedBy: null } });
          continue;
        }

        const providerId = await deliver(channel, recipient, prepared, jump.id, workspace.profile?.company || workspace.name);
        await prisma.automatedDelivery.updateMany({
          where: { id: deliveryId, lockedBy: workerId, status: "PROCESSING" },
          data: { providerId }
        });
        await prisma.$transaction(async (tx) => {
          const completed = await tx.jump.updateMany({
            where: { id: jump.id, workspaceId: workspace.id, status: "PENDING" },
            data: { status: "DONE", completedAt: now, completionMethod: `automatic:${channel.toLowerCase()}` }
          });
          const settled = await tx.automatedDelivery.updateMany({
            where: { id: deliveryId, lockedBy: workerId, status: "PROCESSING" },
            data: { status: "DELIVERED", deliveredAt: now, lockedAt: null, lockedBy: null, error: null }
          });
          if (settled.count !== 1) throw new Error("The automatic-delivery lease was lost before completion.");
          await tx.contactActivity.create({
            data: {
              workspaceId: workspace.id,
              contactId: jump.contactId,
              jumpId: jump.id,
              actorUserId: null,
              kind: "JUMP_OUTCOME",
              outcome: "COMPLETED",
              channel,
              visibility: "WORKSPACE",
              summary: "Sent automatically after the review window.",
              metadata: { automatedDeliveryId: deliveryId, providerId, recipientHash: recipientHash(recipient), jumpWasPending: completed.count === 1 }
            }
          });
          await tx.jumpActionEvent.create({
            data: { workspaceId: workspace.id, jumpId: jump.id, actorUserId: null, action: "COMPOSED", channel, metadata: { automatic: true, automatedDeliveryId: deliveryId, providerId } }
          });
          await tx.auditLog.create({
            data: { workspaceId: workspace.id, actorType: "SYSTEM", action: "jump.automatic-delivery", entityType: "Jump", entityId: jump.id, source: "worker.automatic-delivery", metadata: { channel, automatedDeliveryId: deliveryId, providerId, jumpWasPending: completed.count === 1 } }
          });
        });
        deliveredCount += 1;
      } catch (error) {
        failed += 1;
        await prisma.automatedDelivery.updateMany({
          where: { id: deliveryId, lockedBy: workerId, status: "PROCESSING" },
          data: { status: "FAILED", lockedAt: null, lockedBy: null, error: safeError(error) }
        }).catch(() => undefined);
        console.error(`Automatic ${channel.toLowerCase()} delivery failed for Jump ${jump.id}`, safeError(error));
      }
    }
  }

  return { attempted, delivered: deliveredCount, failed };
}
