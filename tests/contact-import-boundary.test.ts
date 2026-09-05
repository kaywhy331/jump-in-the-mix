import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Contact import boundary", () => {
  it("requires authentication, workspace membership, and blocks view-only support sessions", () => {
    const route = read("src/app/api/contacts/import/route.ts");
    expect(route).toContain("getCurrentSession(");
    expect(route).toContain("session?.user.memberships[0]");
    expect(route).toContain("session.impersonation");
    expect(route).toContain("status: 403");
  });

  it("rate limits analysis and commit requests", () => {
    const route = read("src/app/api/contacts/import/route.ts");
    expect(route).toContain("consumeRateLimit(");
    expect(route).toContain('scope: "api.contact-import"');
    expect(route).toContain('"Retry-After"');
  });

  it("uses workspace-scoped matching, auditing, reconciliation, and idempotency", () => {
    const service = read("src/lib/contact-import-service.ts");
    expect(service).toContain("where: { workspaceId, archivedAt: null }");
    expect(service).toContain("contact-import:${input.importId}:${record.rowId}");
    expect(service).toContain('source: "contacts.import"');
    expect(service).toContain('task: "generate-jumps"');
    expect(service).toContain("targetContactId");
  });

  it("keeps file parsing in the browser and batches server writes", () => {
    const wizard = read("src/components/ContactImportWizardV2.tsx");
    expect(wizard).toContain("parseContactFile(await file.text()");
    expect(wizard).toContain("chunk(analyzable, 100)");
    expect(wizard).toContain('mode: "queue"');
    expect(wizard).toContain('fetch("/api/contacts/import"');
  });
});
