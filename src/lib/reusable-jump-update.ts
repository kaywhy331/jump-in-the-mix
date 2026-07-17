"use server";

import type { Channel } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { containsPrivateNotesPlaceholder, findUnknownPlaceholders } from "@/lib/placeholders";
import { prisma } from "@/lib/prisma";

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function fail(message: string): never {
  redirect(`/settings/jumps?error=${encodeURIComponent(message)}`);
}

function normalizedChannel(raw: string): Channel | null {
  const allowed: Channel[] = ["SMS", "EMAIL", "PHONE_CALL", "VOICEMAIL", "WHATSAPP"];
  return allowed.includes(raw as Channel) ? raw as Channel : null;
}

function validateContent(channel: Channel, formData: FormData) {
  const name = value(formData, "name");
  const subject = value(formData, "subject");
  const body = value(formData, "body");
  const script = value(formData, "script");
  if (!name) throw new Error("Give this Jump a name.");
  if (channel === "EMAIL" && (!subject || !body)) throw new Error("Email Jumps require a subject and body.");
  if (["SMS", "WHATSAPP"].includes(channel) && !body) throw new Error("This Jump requires message content.");
  if (["PHONE_CALL", "VOICEMAIL"].includes(channel) && !script) throw new Error("This Jump requires a script or notes.");
  const content = [subject, body, script].filter(Boolean).join("\n");
  const unknown = findUnknownPlaceholders(content);
  if (unknown.length) throw new Error(`Unsupported placeholders: ${unknown.join(", ")}`);
  if (channel !== "PHONE_CALL" && containsPrivateNotesPlaceholder(content)) {
    throw new Error("Private Notes placeholders may only be used in Phone Call Jumps.");
  }
  return {
    name,
    subject: subject || null,
    body: body || null,
    script: script || null,
    longSms: channel === "SMS" && body.length > 160
  };
}

export async function createReusableJumpAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const channel = normalizedChannel(value(formData, "channel"));
  if (!channel) fail("Choose a valid Jump channel.");
  if (channel === "VOICEMAIL" && workspace.planTier !== "PRO") {
    fail("Ringless Voicemail Jumps are available on Pro.");
  }
  let payload: ReturnType<typeof validateContent>;
  try {
    payload = validateContent(channel, formData);
  } catch (error) {
    fail(error instanceof Error ? error.message : "The Jump could not be created.");
  }
  await prisma.stepTemplate.create({
    data: {
      workspaceId: workspace.id,
      name: payload.name,
      channel,
      versions: {
        create: {
          version: 1,
          subject: payload.subject,
          body: payload.body,
          script: payload.script,
          longSms: payload.longSms
        }
      }
    }
  });
  redirect("/settings/jumps?created=1");
}

export async function updateReusableJumpAction(formData: FormData): Promise<void> {
  const { workspace } = await requireWorkspace();
  const stepTemplateId = value(formData, "stepTemplateId");
  const template = await prisma.stepTemplate.findFirst({
    where: { id: stepTemplateId, workspaceId: workspace.id },
    select: { id: true, channel: true, currentVersion: true }
  });
  if (!template) fail("Jump not found.");
  if (value(formData, "channel") !== template.channel) {
    fail("A reusable Jump's channel cannot change after creation. Create a new Jump for the other channel.");
  }
  if (template.channel === "VOICEMAIL" && workspace.planTier !== "PRO") {
    fail("Ringless Voicemail Jumps require an active Pro plan.");
  }

  let payload: ReturnType<typeof validateContent>;
  try {
    payload = validateContent(template.channel, formData);
  } catch (error) {
    fail(error instanceof Error ? error.message : "The Jump could not be updated.");
  }

  const activeMixSteps = await prisma.mixStep.findMany({
    where: { isActive: true, stepVersion: { stepTemplateId: template.id } },
    select: { id: true }
  });
  await prisma.$transaction(async (tx) => {
    const nextVersion = await tx.stepVersion.create({
      data: {
        stepTemplateId: template.id,
        version: template.currentVersion + 1,
        subject: payload.subject,
        body: payload.body,
        script: payload.script,
        longSms: payload.longSms
      }
    });
    await tx.stepTemplate.update({
      where: { id: template.id },
      data: { name: payload.name, currentVersion: template.currentVersion + 1, isActive: true }
    });
    if (activeMixSteps.length) {
      await tx.mixStep.updateMany({
        where: { id: { in: activeMixSteps.map((item) => item.id) } },
        data: { stepVersionId: nextVersion.id }
      });
    }
  });
  await prisma.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: {} } });
  redirect("/settings/jumps?updated=1");
}
