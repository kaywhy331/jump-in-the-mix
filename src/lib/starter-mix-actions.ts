"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensureStarterMix } from "@/lib/starter-mix";

function fail(message: string): never {
  redirect(`/mixes?error=${encodeURIComponent(message)}`);
}

export async function createStarterMixAction(): Promise<void> {
  const { workspace, user, impersonation } = await requireWorkspace();
  if (impersonation) fail("Administrator support sessions are view-only.");
  const existingStarter = await prisma.mix.findFirst({
    where: { workspaceId: workspace.id, source: "STARTER", status: { not: "ARCHIVED" } },
    select: { id: true }
  });
  if (existingStarter) redirect(`/mixes/${existingStarter.id}/edit?starter=exists`);

  let mixId: string;
  try {
    mixId = (await ensureStarterMix(workspace.id)).id;
  } catch (error) {
    fail(error instanceof Error ? error.message : "The starter plan could not be created.");
  }
  await prisma.$transaction([
    prisma.job.create({ data: { workspaceId: workspace.id, task: "generate-jumps", payload: { mixId } } }),
    prisma.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorType: "USER",
        actorUserId: user.id,
        action: "mix.create.starter",
        entityType: "Mix",
        entityId: mixId,
        source: "mixes.list"
      }
    })
  ]);
  redirect(`/mixes/${mixId}/edit?created=starter`);
}
