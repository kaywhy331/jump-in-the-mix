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

  it("keeps profile, messaging, and community submissions section-scoped", () => {
    const action = read("src/lib/workspace-profile-actions.ts");
    expect(action).toContain('value(formData, "settingsSection", 40)');
    expect(action).toContain('section === "profile"');
    expect(action).toContain('section === "messaging"');
    expect(action).toContain('section === "community"');
    expect(action).toContain("Choose a valid IANA timezone.");
  });
});
