import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SYSTEM_MIX, SystemMixError, validateSystemMixContent } from "@/lib/system-mix";

export async function lockSystemMix(tx: Prisma.TransactionClient) { await tx.$executeRaw`SELECT pg_advisory_xact_lock(814733, 4)`; }
// Callers already holding another lock use Staff → Access → System Mix order.
export async function systemMixState(tx: Prisma.TransactionClient) {
  const config = await tx.systemMixConfig.findUnique({ where: { id: "referral" } });
  if (!config) throw new SystemMixError("Invitation wording is temporarily unavailable. Please try again later.");
  const [published, draft] = await Promise.all([config.publishedVersion, config.draftVersion].map(version => tx.systemMixRevision.findUnique({ where: { systemMixId_version: { systemMixId: config.id, version } } })));
  if (!published || !draft) throw new SystemMixError("Invitation wording needs administrator review.");
  return { config, published, draft };
}
export async function readPublishedSystemMix(tx: Prisma.TransactionClient) {
  const { config, published } = await systemMixState(tx);
  return { version: config.publishedVersion, content: validateSystemMixContent(published) };
}
export async function getPublishedSystemMix() {
  return prisma.$transaction(async tx => { await lockSystemMix(tx); return readPublishedSystemMix(tx); });
}
export async function getSystemMixState() {
  return prisma.$transaction(async tx => { await lockSystemMix(tx); return systemMixState(tx); });
}
// Supports fresh local `db push` setup; migrations install the production baseline.
// Repeated setup must never overwrite an administrator's draft or rollback.
export async function installSystemMixBaseline() {
  return prisma.$transaction(async tx => {
    await lockSystemMix(tx);
    if (await tx.systemMixConfig.findUnique({ where: { id: "referral" } })) return false;
    await tx.systemMixConfig.create({ data: { id: "referral" } });
    const reason = "Initial installation of application invitation wording.";
    await tx.systemMixRevision.create({ data: { version: 1, ...validateSystemMixContent(DEFAULT_SYSTEM_MIX), reason } });
    await tx.systemMixRelease.create({ data: { version: 1, action: "PUBLISH", controlRevision: 0, reason } });
    return true;
  });
}
