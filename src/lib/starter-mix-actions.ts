"use server";

import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { type ErrorViewer, withViewerError } from "@/lib/form-errors";
import { prisma } from "@/lib/prisma";
import { ensureStarterMix } from "@/lib/starter-mix";

function fail(message: string, viewer: ErrorViewer): never {
  redirect(withViewerError("/mixes", message, viewer));
}

export async function createStarterMixAction(): Promise<void> {
  const { session, workspace, user, impersonation } = await requireWorkspace();
  if (impersonation) fail("Administrator support sessions are view-only.", session);
  const existingStarter = await prisma.mix.findFirst({
    where: { workspaceId: workspace.id, source: "STARTER", status: { not: "ARCHIVED" } },
    select: { id: true }
  });
  if (existingStarter) redirect(`/mixes/${existingStarter.id}/edit?starter=exists`);

  let mixId: string;
  try {
    mixId = (await ensureStarterMix(workspace.id)).id;
  } catch {
    // Its only refusal is an operator's (the system date type is missing); database errors never reach the page.
    fail("The starter mix could not be created.", session);
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
