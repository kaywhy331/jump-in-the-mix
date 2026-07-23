import { prisma } from "../src/lib/prisma";

export async function createPendingJumpFixture(label: string): Promise<string> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const [contact, step] = await Promise.all([
    prisma.contact.findFirstOrThrow({ where: { workspaceId: "demo_workspace", archivedAt: null }, select: { id: true } }),
    prisma.mixStep.findFirstOrThrow({
      where: { isActive: true, mix: { workspaceId: "demo_workspace", status: "ACTIVE" } },
      include: { mix: { select: { id: true } }, stepVersion: { include: { stepTemplate: { select: { channel: true } } } } }
    })
  ]);
  const id = `e2e-pending-jump-${suffix}`;
  const channel = step.stepVersion.stepTemplate.channel;
  await prisma.jump.create({
    data: {
      id,
      workspaceId: "demo_workspace",
      contactId: contact.id,
      mixId: step.mix.id,
      mixStepId: step.id,
      stepVersionId: step.stepVersionId,
      scheduledAt: new Date(),
      status: "PENDING",
      reason: label,
      templateSnapshot: { channel, body: "Prepared acceptance follow-up" },
      renderedSnapshot: { body: "Prepared acceptance follow-up" },
      uniquenessKey: `e2e:pending:${suffix}`
    }
  });
  return id;
}

export async function removePendingJumpFixture(id: string): Promise<void> {
  await prisma.jump.deleteMany({ where: { id, workspaceId: "demo_workspace" } });
}
