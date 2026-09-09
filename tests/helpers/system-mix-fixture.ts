import { prisma } from "../../src/lib/prisma";

// The singleton is shared by the local application. Never use against a live DB.
export async function preserveSystemMixFixture() {
  if (!/^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "")) throw new Error("System Mix fixtures require a disposable loopback database.");
  const config = await prisma.systemMixConfig.findUniqueOrThrow({ where: { id: "referral" } });
  const revisions = await prisma.systemMixRevision.findMany({ where: { systemMixId: config.id } });
  const releases = await prisma.systemMixRelease.findMany({ where: { systemMixId: config.id } });
  return async () => prisma.$transaction(async tx => {
    await tx.systemMixConfig.deleteMany({ where: { id: config.id } });
    await tx.systemMixConfig.create({ data: config });
    await tx.systemMixRevision.createMany({ data: revisions });
    await tx.systemMixRelease.createMany({ data: releases });
  });
}
