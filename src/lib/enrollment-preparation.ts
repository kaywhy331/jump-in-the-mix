import { Prisma } from "@/generated/prisma/client";

/** The enrollment revision read by one preparation pass, not an authority to write after it changes. */
export type PreparationEnrollment = { id: string; workspaceId: string; updatedAt: Date };
export const preparationEnrollmentKey = (row: PreparationEnrollment) => `${row.id}:${row.updatedAt.toISOString()}`;

/**
 * Admission and follow-up writes hold these locks until commit. Undo/Remove takes the same enrollment lock
 * before Journey records and Beats, so a pass either lands before the end or sees its changed revision.
 * FOR SHARE also conflicts with non-key updates; FOR KEY SHARE would not protect isActive/updatedAt.
 */
export async function lockPreparationEnrollments(tx: Pick<Prisma.TransactionClient, "$queryRaw">, sources: PreparationEnrollment[]): Promise<Set<string>> {
  if (!sources.length) return new Set();
  const unique = [...new Map(sources.map(source => [source.id, source])).values()];
  const rows = await tx.$queryRaw<Array<{ id: string; workspaceId: string; isActive: boolean; updatedAt: Date }>>`
    SELECT id, "workspaceId", "isActive", "updatedAt" FROM "MixAssignment"
    WHERE (${Prisma.join(unique.map(source => Prisma.sql`(id = ${source.id} AND "workspaceId" = ${source.workspaceId})`), " OR ")})
    ORDER BY id FOR SHARE`;
  const current = new Map(rows.map(row => [row.id, row]));
  return new Set(sources.filter(source => {
    const row = current.get(source.id);
    return row?.isActive && row.workspaceId === source.workspaceId && row.updatedAt.getTime() === source.updatedAt.getTime();
  }).map(preparationEnrollmentKey));
}
