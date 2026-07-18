import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("support schema and migration", () => {
  it("defines durable ticket, thread, triage, and email delivery state", () => {
    const schema = read("prisma/support.prisma");
    expect(schema).toContain("model SupportTicket {");
    expect(schema).toContain("model SupportTicketMessage {");
    expect(schema).toContain("enum SupportTicketCategory");
    expect(schema).toContain("enum SupportTicketPriority");
    expect(schema).toContain("enum SupportTicketStatus");
    expect(schema).toContain("enum SupportEmailStatus");
    expect(schema).toContain("workspaceId");
    expect(schema).toContain("requesterUserId");
    expect(schema).toContain("lastActivityAt");
    expect(schema).toContain("emailProviderId");
    expect(schema).toContain("@@index([workspaceId, requesterUserId, lastActivityAt])");
  });

  it("ships the support center through the ordinary production migration path", () => {
    const migration = read("prisma/migrations/20260716210000_support_center/migration.sql");
    const rehearsal = read("scripts/rehearse-migration.mjs");
    expect(migration).toContain('CREATE TABLE "SupportTicket"');
    expect(migration).toContain('CREATE TABLE "SupportTicketMessage"');
    expect(migration).toContain('SupportTicketMessage_ticketId_fkey');
    expect(migration).toContain('ON DELETE CASCADE');
    expect(rehearsal).toContain('["migrate", "deploy"]');
  });
});
