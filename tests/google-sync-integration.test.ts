import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { encryptIntegrationCredentials } from "../src/lib/integration-crypto";
import { runGoogleContactsSync } from "../src/lib/google-sync-service";
import { prisma } from "../src/lib/prisma";

type GooglePayload = {
  connections: unknown[];
  nextSyncToken: string;
};

describe.sequential("Google Contacts sync", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const ids: Record<string, string> = {};
  const originalFetch = globalThis.fetch;

  function stubPeopleApi(payload: GooglePayload) {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.hostname === "people.googleapis.com" && url.pathname.endsWith("/people/me/connections")) {
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      throw new Error(`Unexpected Google integration request: ${url.toString()}`);
    }));
  }

  async function createRun(mode: string): Promise<string> {
    const run = await prisma.syncRun.create({
      data: {
        workspaceId: ids.workspace,
        connectionId: ids.connection,
        mode,
        status: "QUEUED"
      }
    });
    return run.id;
  }

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `google-sync-${suffix}@example.com`, name: "Google Sync User", passwordHash: "test-only" }
    });
    ids.user = user.id;
    const workspace = await prisma.workspace.create({
      data: {
        name: "Google Sync Workspace",
        slug: `google-sync-${suffix}`,
        ownerId: user.id,
        planTier: "PLUS",
        members: { create: { userId: user.id, role: "OWNER" } },
        profile: { create: {} }
      }
    });
    ids.workspace = workspace.id;
    const credentialsCiphertext = encryptIntegrationCredentials({
      accessToken: "test-access-token",
      accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      refreshToken: "test-refresh-token",
      tokenType: "Bearer",
      scope: "https://www.googleapis.com/auth/contacts.readonly"
    });
    const connection = await prisma.integrationConnection.create({
      data: {
        workspaceId: workspace.id,
        provider: "GOOGLE_CONTACTS",
        status: "ACTIVE",
        externalAccountId: `google-${suffix}`,
        scopes: ["https://www.googleapis.com/auth/contacts.readonly"],
        credentialsCiphertext,
        metadata: { selectedGroupResourceNames: [], selectedGroupLabels: {}, autoMergeExact: true }
      }
    });
    ids.connection = connection.id;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
    if (ids.workspace) await prisma.workspace.deleteMany({ where: { id: ids.workspace } });
    if (ids.user) await prisma.user.deleteMany({ where: { id: ids.user } });
  });

  it("creates a local Contact, provider link, Jump Date, audit record, and cursor", async () => {
    stubPeopleApi({
      connections: [{
        resourceName: "people/google-contact-1",
        etag: "etag-one",
        metadata: { sources: [{ updateTime: "2026-07-16T12:00:00Z" }] },
        names: [{ displayName: "Jordan Lee", givenName: "Jordan", familyName: "Lee", metadata: { primary: true } }],
        organizations: [{ name: "Example Co", current: true }],
        emailAddresses: [{ value: "Jordan@Example.com", formattedType: "Work", metadata: { primary: true } }],
        phoneNumbers: [{ value: "+1 (626) 555-0199", formattedType: "Mobile", metadata: { primary: true } }],
        biographies: [{ value: "Imported from a real Google Contact.", contentType: "TEXT_PLAIN" }],
        birthdays: [{ date: { year: 1988, month: 5, day: 12 } }]
      }],
      nextSyncToken: "sync-token-one"
    });
    const syncRunId = await createRun("INITIAL");

    const result = await runGoogleContactsSync({ connectionId: ids.connection, syncRunId, actorUserId: ids.user });

    expect(result).toMatchObject({ created: 1, updated: 0, failed: 0, nextSyncToken: "sync-token-one", fullSync: true });
    const contact = await prisma.contact.findFirstOrThrow({
      where: { workspaceId: ids.workspace, source: "GOOGLE" },
      include: { emails: true, phones: true, jumpDates: { include: { dateType: true } }, externalLinks: true }
    });
    ids.contact = contact.id;
    expect(contact.displayName).toBe("Jordan Lee");
    expect(contact.company).toBe("Example Co");
    expect(contact.emails).toHaveLength(1);
    expect(contact.emails[0]).toMatchObject({ normalized: "jordan@example.com", isPrimary: true });
    expect(contact.phones[0]).toMatchObject({ normalized: "+16265550199", isPrimary: true });
    expect(contact.jumpDates[0]).toMatchObject({ month: 5, day: 12, recurrence: "YEARLY", source: "GOOGLE" });
    expect(contact.jumpDates[0].dateType.name).toBe("Birthday");
    expect(contact.externalLinks[0]).toMatchObject({ provider: "GOOGLE_CONTACTS", externalId: "people/google-contact-1", deletedAt: null });

    const [connection, run, auditCount, reconciliationCount] = await Promise.all([
      prisma.integrationConnection.findUniqueOrThrow({ where: { id: ids.connection } }),
      prisma.syncRun.findUniqueOrThrow({ where: { id: syncRunId } }),
      prisma.auditLog.count({ where: { workspaceId: ids.workspace, action: "contact.sync.google.create" } }),
      prisma.job.count({ where: { workspaceId: ids.workspace, task: "generate-jumps" } })
    ]);
    expect(connection.syncCursor).toBe("sync-token-one");
    expect(connection.lastSyncAt).toBeInstanceOf(Date);
    expect(run).toMatchObject({ status: "COMPLETED", createdCount: 1, errorCount: 0 });
    expect(auditCount).toBe(1);
    expect(reconciliationCount).toBeGreaterThanOrEqual(1);
  });

  it("uses the provider link for incremental updates without creating a duplicate Contact", async () => {
    stubPeopleApi({
      connections: [{
        resourceName: "people/google-contact-1",
        etag: "etag-two",
        metadata: { sources: [{ updateTime: "2026-07-16T13:00:00Z" }] },
        names: [{ displayName: "Jordan Lee", givenName: "Jordan", familyName: "Lee", metadata: { primary: true } }],
        organizations: [{ name: "Updated Example Co", current: true }],
        emailAddresses: [{ value: "jordan@example.com", formattedType: "Work", metadata: { primary: true } }],
        phoneNumbers: [{ value: "+1 626 555 0199", formattedType: "Mobile", metadata: { primary: true } }]
      }],
      nextSyncToken: "sync-token-two"
    });
    const syncRunId = await createRun("INCREMENTAL");

    const result = await runGoogleContactsSync({ connectionId: ids.connection, syncRunId, actorUserId: ids.user });

    expect(result).toMatchObject({ created: 0, updated: 1, failed: 0, nextSyncToken: "sync-token-two", fullSync: false });
    expect(await prisma.contact.count({ where: { workspaceId: ids.workspace } })).toBe(1);
    const contact = await prisma.contact.findUniqueOrThrow({ where: { id: ids.contact } });
    expect(contact.company).toBe("Updated Example Co");
    const connection = await prisma.integrationConnection.findUniqueOrThrow({ where: { id: ids.connection } });
    expect(connection.syncCursor).toBe("sync-token-two");
  });

  it("preserves the local Contact when Google reports a deletion", async () => {
    stubPeopleApi({
      connections: [{
        resourceName: "people/google-contact-1",
        etag: "etag-deleted",
        metadata: { deleted: true, sources: [{ updateTime: "2026-07-16T14:00:00Z" }] }
      }],
      nextSyncToken: "sync-token-three"
    });
    const syncRunId = await createRun("INCREMENTAL");

    const result = await runGoogleContactsSync({ connectionId: ids.connection, syncRunId, actorUserId: ids.user });

    expect(result).toMatchObject({ created: 0, updated: 0, skipped: 1, failed: 0 });
    expect(await prisma.contact.count({ where: { workspaceId: ids.workspace } })).toBe(1);
    const link = await prisma.externalContactLink.findFirstOrThrow({
      where: { workspaceId: ids.workspace, provider: "GOOGLE_CONTACTS", externalId: "people/google-contact-1" }
    });
    expect(link.deletedAt).toBeInstanceOf(Date);
  });
});
