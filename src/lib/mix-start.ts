import type { Prisma } from "@/generated/prisma/client";

// A manual sequence held as a draft starts when first activated. Resuming a
// paused plan or editing a plan with history must retain its original clock.
export async function startDraftMix(tx: Prisma.TransactionClient, input: { workspaceId: string; mixId: string; now: Date }): Promise<boolean> {
  const mix = await tx.mix.findFirst({
    where: { id: input.mixId, workspaceId: input.workspaceId, status: "DRAFT", triggerMode: "MANUAL_START" },
    select: { _count: { select: { jumps: true } } }
  });
  if (!mix || mix._count.jumps > 0) return false;
  await tx.mixAssignment.updateMany({ where: { workspaceId: input.workspaceId, mixId: input.mixId, isActive: true }, data: { startDate: input.now } });
  return true;
}
