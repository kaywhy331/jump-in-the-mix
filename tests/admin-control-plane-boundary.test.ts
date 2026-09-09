import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("administration and observability boundaries", () => {
  it("requires platform-administrator access on every new control-plane page", () => {
    for (const path of [
      "src/app/(staff)/admin/page.tsx",
      "src/app/(staff)/admin/operations/page.tsx",
      "src/app/(staff)/admin/audit/page.tsx",
      "src/app/(staff)/admin/settings/page.tsx"
    ]) {
      expect(read(path)).toMatch(/requirePlatformAdmin\("(?:dashboard.read|operations.read|audit.read|settings.manage)"\)/);
    }
  });

  it("delegates retries with the authenticated administrator and session", () => {
    const actions = read("src/lib/admin-operations-actions.ts");
    const service = read("src/lib/admin-job-retry.ts");
    expect(actions).toContain('requirePlatformAdmin("jobs.retry")');
    expect(actions).toContain("await retryFailedJob({ actorUserId: user.id, actorSessionId: session.id");
    expect(service).toContain('action: "admin.job.retry"');
    expect(service).toContain("actorUserId: input.actorUserId");
    expect(service).not.toContain("deleteMany({ where: { task:");
  });

  it("does not render provider credentials in operations or audit views", () => {
    const operations = read("src/app/(staff)/admin/operations/page.tsx");
    const audit = read("src/app/(staff)/admin/audit/page.tsx");
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
    expect(actions).toMatch(/requirePlatformAdmin\("(?:dashboard.read|operations.read|audit.read|settings.manage)"\)/);
    expect(actions).toContain('action: "admin.platform-setting.update"');
    expect(actions).toContain('action: "admin.platform-setting.reset"');
  });

  it("connects managed options to plan authoring and discovery", () => {
    const mixNew = read("src/app/(app)/mixes/new/page.tsx");
    const mixEdit = read("src/app/(app)/mixes/[mixId]/edit/page.tsx");
    expect(mixNew).toContain('getPlatformStringList("mix.categories")');
    expect(mixEdit).toContain('getPlatformStringList("mix.industries")');
    expect(read("src/app/(app)/templates/page.tsx")).toContain('getPlatformStringList("mix.categories")');
  });

  it("ships a dedicated production migration for PlatformSetting", () => {
    const migration = "prisma/migrations/20260717050000_admin_control_plane/migration.sql";
    expect(existsSync(migration)).toBe(true);
    expect(read(migration)).toContain('CREATE TABLE "PlatformSetting"');
    expect(read("prisma/platform-settings.prisma")).toContain("model PlatformSetting");
  });
});
