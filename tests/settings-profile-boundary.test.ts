import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("settings and profile design boundaries", () => {
  it("stores repeatable profile records additively while retaining legacy fields", () => {
    const schema = read("prisma/schema.prisma");
    const migration = read("prisma/migrations/20260719173000_repeatable_workspace_profile/migration.sql");

    expect(schema).toMatch(/\bproducts\s+Json\?/);
    expect(schema).toMatch(/\bsenderDetails\s+Json\?/);
    expect(migration).toContain('ADD COLUMN "products" JSONB');
    expect(migration).toContain('ADD COLUMN "senderDetails" JSONB');
    expect(migration).not.toMatch(/DROP\s+(COLUMN|TABLE)/i);
  });

  it("exposes only personal and core workflow settings", () => {
    const page = read("src/app/(app)/settings/page.tsx");
    for (const title of ["My business", "Personal preferences", "Notifications", "Date types", "Password & sessions", "Data & privacy"]) expect(page).toContain(title);
    const business = read("src/app/(app)/settings/business/page.tsx");
    for (const field of ["Business name", "Services", "Text signature", "Email signature"]) expect(business).toContain(field);
    expect(page).not.toMatch(/community|billing|integration|workspace profile|workspace switcher/i);
  });
});
