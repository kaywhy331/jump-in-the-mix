import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("settings and profile design boundaries", () => {
  it("stores repeatable profile records additively while retaining legacy fields", () => {
    const schema = read("prisma/schema.prisma");
    const migration = read("prisma/migrations/20260719173000_repeatable_workspace_profile/migration.sql");

    expect(schema).toContain("products        Json?");
    expect(schema).toContain("senderDetails   Json?");
    expect(migration).toContain('ADD COLUMN "products" JSONB');
    expect(migration).toContain('ADD COLUMN "senderDetails" JSONB');
    expect(migration).not.toMatch(/DROP\s+(COLUMN|TABLE)/i);
  });

  it("exposes only personal and core workflow settings", () => {
    const page = read("src/app/(app)/settings/page.tsx");
    for (const title of ["Personal preferences", "Action Templates", "Important Date Types", "Password & sessions", "Data & privacy"]) expect(page).toContain(title);
    expect(page).not.toMatch(/community|billing|integration|workspace/i);
  });
});
