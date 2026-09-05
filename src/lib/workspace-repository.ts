import type { Prisma, PrismaClient } from "@/generated/prisma/client";

export type WorkspaceDb = PrismaClient | Prisma.TransactionClient;

export class WorkspaceScopeError extends Error {
  constructor(entity: string) {
    super(`${entity} is not available for this account.`);
    this.name = "WorkspaceScopeError";
  }
}

export async function findWorkspaceContact(db: WorkspaceDb, workspaceId: string, contactId: string) {
  return db.contact.findFirst({ where: { id: contactId, workspaceId, archivedAt: null } });
}

export async function findWorkspaceMix(db: WorkspaceDb, workspaceId: string, mixId: string) {
  return db.mix.findFirst({ where: { id: mixId, workspaceId, status: { not: "ARCHIVED" } } });
}

export async function findWorkspaceGroup(db: WorkspaceDb, workspaceId: string, groupId: string) {
  return db.group.findFirst({ where: { id: groupId, workspaceId } });
}

export async function findWorkspaceStepTemplate(db: WorkspaceDb, workspaceId: string, stepTemplateId: string) {
  return db.stepTemplate.findFirst({ where: { id: stepTemplateId, workspaceId } });
}

export async function findWorkspaceJump(db: WorkspaceDb, workspaceId: string, jumpId: string) {
  return db.jump.findFirst({ where: { id: jumpId, workspaceId } });
}

export async function findWorkspaceCustomFieldDefinition(
  db: WorkspaceDb,
  workspaceId: string,
  definitionId: string
) {
  return db.contactCustomFieldDefinition.findFirst({ where: { id: definitionId, workspaceId } });
}

export async function findAvailableDateType(db: WorkspaceDb, workspaceId: string, dateTypeId: string) {
  return db.dateType.findFirst({
    where: {
      id: dateTypeId,
      isActive: true,
      OR: [{ workspaceId }, { workspaceId: null, isSystem: true }]
    }
  });
}

export async function requireWorkspaceContacts(db: WorkspaceDb, workspaceId: string, contactIds: string[]) {
  const uniqueIds = [...new Set(contactIds.filter(Boolean))];
  if (!uniqueIds.length) throw new WorkspaceScopeError("Contact");
  const contacts = await db.contact.findMany({
    where: { workspaceId, archivedAt: null, id: { in: uniqueIds } },
    orderBy: { displayName: "asc" }
  });
  if (contacts.length !== uniqueIds.length) throw new WorkspaceScopeError("One or more contacts");
  return contacts;
}

export async function requireWorkspaceCustomFieldDefinitions(
  db: WorkspaceDb,
  workspaceId: string,
  definitionIds: string[]
) {
  const uniqueIds = [...new Set(definitionIds.filter(Boolean))];
  if (!uniqueIds.length) return [];
  const definitions = await db.contactCustomFieldDefinition.findMany({
    where: { workspaceId, id: { in: uniqueIds } },
    orderBy: { name: "asc" }
  });
  if (definitions.length !== uniqueIds.length) throw new WorkspaceScopeError("One or more custom contact fields");
  return definitions;
}
