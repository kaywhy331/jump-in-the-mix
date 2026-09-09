import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import { LibraryError, type LibraryContent } from "@/lib/library-content";

export async function lockLibrary(tx: Prisma.TransactionClient) { await tx.$executeRaw`SELECT pg_advisory_xact_lock(814733, 3)`; }
export const libraryJson = (content: LibraryContent) => content as unknown as Prisma.InputJsonValue;

export async function libraryState(tx: Prisma.TransactionClient, id: string) {
  const shared = await tx.sharedMix.findUnique({ where: { id } });
  if (!shared) throw new LibraryError("This ready-made mix no longer exists.");
  const metadata = await tx.sharedMixMetadata.findUnique({ where: { sharedMixId: id } });
  const version = metadata?.version ?? 1, draftVersion = metadata?.draftVersion ?? version;
  const draft = await tx.sharedMixRevision.findUnique({ where: { sharedMixId_version: { sharedMixId: id, version: draftVersion } } });
  const published: LibraryContent = { title: shared.title, description: shared.description, category: shared.category,
    industry: shared.industry ?? "Any business", framework: shared.framework, triggerMode: metadata?.triggerMode ?? "MANUAL_START",
    dateTypeName: metadata?.dateTypeName ?? null, dateTypeSlug: metadata?.dateTypeSlug ?? null,
    featured: Boolean(metadata?.featuredAt), steps: shared.steps as unknown as LibraryContent["steps"] };
  return { shared, metadata, version, draftVersion, controlRevision: metadata?.controlRevision ?? 0, published,
    draft: draft ? draft.snapshot as unknown as LibraryContent : published };
}

// Backstop for supported programmatic fixture/catalog creation after migration.
// Caller holds the library lock; ordinary reads never manufacture history.
export async function captureLibraryBaseline(tx: Prisma.TransactionClient, state: Awaited<ReturnType<typeof libraryState>>) {
  const id = state.shared.id;
  if (await tx.sharedMixRevision.count({ where: { sharedMixId: id } })) return;
  await tx.sharedMixRevision.create({ data: { sharedMixId: id, version: state.version, snapshot: libraryJson(state.published), reason: "Baseline of existing library content; earlier versions unavailable." } });
  await tx.sharedMixMetadata.upsert({ where: { sharedMixId: id }, create: { sharedMixId: id, version: state.version, draftVersion: state.version }, update: { draftVersion: state.version } });
  if (state.shared.status === "APPROVED") await tx.sharedMixRelease.create({ data: { sharedMixId: id, version: state.version, controlRevision: state.controlRevision, action: "PUBLISH", reason: "Baseline record of existing publication." } });
}

export async function applyLibraryPublication(tx: Prisma.TransactionClient, id: string, version: number, content: LibraryContent) {
  const { triggerMode, dateTypeName, dateTypeSlug, featured, ...fields } = content;
  await tx.sharedMix.update({ where: { id }, data: { ...fields, steps: content.steps as unknown as Prisma.InputJsonValue,
    durationDays: Math.max(...content.steps.map(step => step.dayOffset)) - Math.min(...content.steps.map(step => step.dayOffset)), status: "APPROVED" } });
  await tx.sharedMixMetadata.update({ where: { sharedMixId: id }, data: { version, triggerMode, dateTypeName, dateTypeSlug,
    featuredAt: featured ? new Date() : null, publishedAt: new Date(), controlRevision: { increment: 1 } } });
}

export async function getLibraryState(id: string) {
  return prisma.$transaction(async tx => { await lockLibrary(tx); return libraryState(tx, id); });
}

export async function readPublishedLibrary(tx: Prisma.TransactionClient, id: string, expectedVersion?: number) {
  const shared = await tx.sharedMix.findFirst({ where: { id, status: "APPROVED" } });
  if (!shared) throw new LibraryError("This ready-made mix is not currently available.");
  const metadata = await tx.sharedMixMetadata.findUnique({ where: { sharedMixId: id } });
  if (expectedVersion !== undefined && (!Number.isSafeInteger(expectedVersion) || expectedVersion !== (metadata?.version ?? 1))) throw new LibraryError("This mix changed since your preview. Reload and review it before continuing.");
  return { shared, metadata };
}
