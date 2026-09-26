import { Prisma } from "@/generated/prisma/client";

// All admission paths take this transaction-scoped lock before reading eligibility.
// Low-volume launch traffic benefits from one simple gate, including schedule claims.
export async function lockAccess(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(814733, 1)`;
}

// Contact imports commit under a key of their own workspace, not under the access lock, so an import
// row delays neither sign-ins nor other workspaces' imports. Class 814734 keeps these keys apart from
// the fixed keys (814733, n). One order everywhere:
//   lockStaff → lockAccess → workspace import key → import Job rows → import batch rows.
// Suspension, account deletion, queueing and cancelling take the key after lockAccess: they wait for
// the row in progress, and every later row of that workspace reads what they committed.
export async function lockWorkspaceImport(tx: Prisma.TransactionClient, workspaceId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(814734, hashtext(${workspaceId}))`;
}

/** The import keys of several workspaces, taken in key order so that two such callers always queue alike. */
export async function lockWorkspaceImports(tx: Prisma.TransactionClient, workspaceIds: readonly string[]): Promise<void> {
  const ids = [...new Set(workspaceIds)];
  const ordered = ids.length < 2 ? ids : (await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM unnest(ARRAY[${Prisma.join(ids)}]::text[]) AS id ORDER BY hashtext(id), id`).map(row => row.id);
  for (const id of ordered) await lockWorkspaceImport(tx, id);
}
