import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { clearRateLimit, rateLimitKey } from "@/lib/rate-limit";

const auth = vi.hoisted(() => ({ context: {} as Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => auth.context }));
import { GET as exportAccount } from "@/app/api/account/export/route";

type ExportedDefinition = { id: string; definition: unknown };
type ExportedInstance = { admissionKey: string; definitionId: string; definition?: unknown };

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
const exportRequest = (format?: "csv") => new Request(`https://local.invalid/api/account/export${format ? "?format=csv" : ""}`);

describe.skipIf(!local).sequential("personal data export limits and shape", () => {
  let userId: string, workspaceId: string;
  beforeEach(async () => {
    const user = await prisma.user.create({ data: { email: `export-${randomUUID()}@example.com`, name: "Export owner" } }); userId = user.id;
    const workspace = await prisma.workspace.create({ data: { name: "Export test", slug: randomUUID(), ownerId: userId } }); workspaceId = workspace.id;
    auth.context = { user, workspace, impersonation: null };
  });
  afterEach(async () => {
    await clearRateLimit("account.export", [userId]);
    await prisma.workspace.delete({ where: { id: workspaceId } });
    await prisma.user.delete({ where: { id: userId } });
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it("allows six exports an hour in either format, then answers 429 with Retry-After", async () => {
    for (let index = 0; index < 6; index += 1) {
      const response = await exportAccount(exportRequest(index % 2 ? "csv" : undefined));
      expect(response.status, `export ${index + 1}`).toBe(200);
    }
    const limited = await exportAccount(exportRequest());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("3600");
    expect(limited.headers.get("Cache-Control")).toBe("no-store");
    expect(await limited.json()).toEqual({ error: "Exports are limited to six per hour. Try again in about 60 minutes." });
    expect((await exportAccount(exportRequest("csv"))).status).toBe(429);
  });

  it("refuses a support view with 403 without spending the owner's exports", async () => {
    auth.context = { ...auth.context, impersonation: { id: "support-view" } };
    for (let index = 0; index < 7; index += 1) {
      const refused = await exportAccount(exportRequest(index % 2 ? "csv" : undefined));
      expect(refused.status).toBe(403);
      expect(await refused.json()).toEqual({ error: "Personal data export is unavailable during a support session." });
    }
    expect(await prisma.authRateLimit.findUnique({ where: { key: rateLimitKey("account.export", [userId]) } })).toBeNull();
    auth.context = { ...auth.context, impersonation: null };
    expect((await exportAccount(exportRequest())).status).toBe(200);
    expect((await prisma.authRateLimit.findUniqueOrThrow({ where: { key: rateLimitKey("account.export", [userId]) } })).attempts).toBe(1);
  });

  it("writes compact JSON and each distinct workflow definition once", async () => {
    const contact = await prisma.contact.create({ data: { workspaceId, displayName: "Robin Export" } });
    const shared = { rules: [{ id: "rule-estimate", name: "What happened with the estimate?" }], revision: 1 };
    const other = { rules: [{ id: "rule-warranty", name: "Warranty check" }], revision: 2 };
    for (const [admissionKey, definition] of [["first", shared], ["second", shared], ["third", other]] as const) {
      await prisma.mixWorkflowInstance.create({ data: { workspaceId, contactId: contact.id, admissionKey, label: `Run ${admissionKey}`, definition, state: { visits: {} } } });
    }
    const response = await exportAccount(exportRequest());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    const text = await response.text();
    expect(text).not.toMatch(/\n|": /);
    const { definitions, instances } = JSON.parse(text).mixWorkflow as { definitions: ExportedDefinition[]; instances: ExportedInstance[] };
    expect(definitions).toHaveLength(2);
    expect(instances).toHaveLength(3);
    for (const instance of instances) expect(instance).not.toHaveProperty("definition");
    const idFor = (key: string) => instances.find((instance) => instance.admissionKey === key)?.definitionId;
    expect(idFor("first")).toMatch(/^[0-9a-f]{16}$/);
    expect(idFor("second")).toBe(idFor("first"));
    expect(idFor("third")).not.toBe(idFor("first"));
    expect(definitions.find((item) => item.id === idFor("first"))?.definition).toEqual(shared);
    expect(definitions.find((item) => item.id === idFor("third"))?.definition).toEqual(other);
  });
});
