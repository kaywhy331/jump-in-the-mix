import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("administration and observability boundaries", () => {
  it("requires platform-administrator access on every new control-plane page", () => {
    for (const path of [
      "src/app/(app)/admin/page.tsx",
      "src/app/(app)/admin/operations/page.tsx",
      "src/app/(app)/admin/audit/page.tsx",
      "src/app/(app)/admin/settings/page.tsx"
    ]) {
      expect(read(path)).toContain("requirePlatformAdmin()");
    }
  });

  it("allows retry only for failed jobs and records the real administrator", () => {
    const actions = read("src/lib/admin-operations-actions.ts");
    expect(actions).toContain("if (!job.failedAt && !job.lastError)");
    expect(actions).toContain('action: "admin.job.retry"');
    expect(actions).toContain("actorUserId: user.id");
    expect(actions).not.toContain("deleteMany({ where: { task:");
  });

  it("does not render provider credentials in operations or audit views", () => {
    const operations = read("src/app/(app)/admin/operations/page.tsx");
    const audit = read("src/app/(app)/admin/audit/page.tsx");
    for (const secretName of ["credentialsCiphertext", "refreshToken", "accessToken", "STRIPE_SECRET_KEY", "GOOGLE_CLIENT_SECRET"]) {
      expect(operations).not.toContain(secretName);
      expect(audit).not.toContain(secretName);
    }
  });

  it("uses allowlisted setting keys with server-side validation and audit", () => {
    const service = read("src/lib/platform-settings.ts");
    const actions = read("src/lib/admin-settings-actions.ts");
    expect(service).toContain("PLATFORM_SETTING_DEFINITIONS");
    expect(service).toContain("validatePlatformSettingValue");
    expect(actions).toContain("requirePlatformAdmin()");
    expect(actions).toContain('action: "admin.platform-setting.update"');
    expect(actions).toContain('action: "admin.platform-setting.reset"');
  });

  it("connects managed options to Mix and AI authoring", () => {
    const mixNew = read("src/app/(app)/mixes/new/page.tsx");
    const mixEdit = read("src/app/(app)/mixes/[mixId]/edit/page.tsx");
    const wizard = read("src/app/(app)/mixes/wizard/page.tsx");
    const wizardActions = read("src/lib/ai-mix-actions.ts");
    expect(mixNew).toContain('getPlatformStringList("mix.categories")');
    expect(mixEdit).toContain('getPlatformStringList("mix.industries")');
    expect(wizard).toContain('getPlatformStringList("ai.objectives")');
    expect(wizardActions).toContain('getPlatformBoolean("feature.aiProviderGeneration")');
  });

  it("ships a dedicated production migration for PlatformSetting", () => {
    const migration = "prisma/migrations/20260717050000_admin_control_plane/migration.sql";
    expect(existsSync(migration)).toBe(true);
    expect(read(migration)).toContain('CREATE TABLE "PlatformSetting"');
    expect(read("prisma/platform-settings.prisma")).toContain("model PlatformSetting");
  });
});
