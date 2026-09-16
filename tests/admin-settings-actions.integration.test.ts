import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/prisma";
const auth = vi.hoisted(() => ({ require: vi.fn() }));
vi.mock("../src/lib/auth", () => ({ requirePlatformAdmin: auth.require }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { updateLibraryOptionsAction } from "../src/lib/admin-settings-actions";
import { PLATFORM_SETTING_DEFINITIONS } from "../src/lib/platform-settings";

describe.sequential("library options concurrent changes", () => {
  const key = "mix.categories", defaults = [...PLATFORM_SETTING_DEFINITIONS[key].defaultValue];
  let userId: string;
  let original: Awaited<ReturnType<typeof prisma.platformSetting.findUnique>>;
  beforeAll(async () => {
    original = await prisma.platformSetting.findUnique({ where: { key } });
    await prisma.platformSetting.deleteMany({ where: { key } });
    const user = await prisma.user.create({ data: { name: "Settings fixture", email: `settings-${randomUUID()}@example.test` } });
    userId = user.id;
    auth.require.mockResolvedValue({ user: { ...user, memberships: [] } });
  });
  afterAll(async () => {
    await prisma.platformSetting.deleteMany({ where: { key } });
    if (original) await prisma.platformSetting.create({ data: { ...original, value: original.value === null ? Prisma.JsonNull : original.value } });
    await prisma.platformAuditEvent.deleteMany({ where: { actorUserId: userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });
  const form = (revision: string, options: string[], operation = "save") => {
    const data = new FormData(); data.set("key", key); data.set("options", options.join("\n")); data.set("expectedRevision", revision); data.set("operation", operation); return data;
  };
  it("accepts one concurrent save and returns a recoverable error for the stale selection", async () => {
    const results = await Promise.all([updateLibraryOptionsAction({}, form("default", defaults.slice(0,1))), updateLibraryOptionsAction({}, form("default", defaults.slice(1,2)))]);
    expect(results.filter(result => result.saved)).toHaveLength(1);
    expect(results.find(result => result.error)?.error).toContain("changed while you were editing");
    expect(await prisma.platformAuditEvent.count({ where: { actorUserId: userId } })).toBe(1);
  });
  it("rejects a stale reset and resets only the reviewed revision", async () => {
    expect((await updateLibraryOptionsAction({}, form("default", [], "reset"))).error).toContain("changed while you were editing");
    const current = await prisma.platformSetting.findUniqueOrThrow({ where: { key } });
    const result = await updateLibraryOptionsAction({}, form(current.updatedAt.toISOString(), [], "reset"));
    expect(result).toMatchObject({ revision: "default", options: defaults, saved: "Reviewed defaults restored." });
    expect(await prisma.platformSetting.findUnique({ where: { key } })).toBeNull();
  });
});
