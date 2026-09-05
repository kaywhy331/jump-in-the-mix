import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getPlatformSettingsSnapshot } from "../src/lib/platform-settings";
import { prisma } from "../src/lib/prisma";

describe.sequential("platform settings persistence", () => {
  const key = `test.control-plane.${randomUUID().replaceAll("-", "")}`;

  afterAll(async () => {
    await prisma.platformSetting.deleteMany({ where: { key } });
  });

  it("persists JSON configuration through the migrated model", async () => {
    await prisma.platformSetting.create({
      data: {
        key,
        category: "Test",
        label: "Test control-plane setting",
        value: ["One", "Two"],
        isPublic: false
      }
    });
    const saved = await prisma.platformSetting.findUnique({ where: { key } });
    expect(saved?.value).toEqual(["One", "Two"]);
  });

  it("returns only reviewed allowlisted settings to the admin UI", async () => {
    const snapshot = await getPlatformSettingsSnapshot();
    expect(snapshot.some((setting) => setting.key === key)).toBe(false);
    expect(snapshot.map((setting) => setting.key)).toContain("mix.categories");
    expect(snapshot.map((setting) => setting.key)).toContain("mix.industries");
  });
});
