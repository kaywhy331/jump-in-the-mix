import { describe, expect, it } from "vitest";
import { ADMIN_AREAS, effectiveAdminPermissions } from "../src/lib/admin-permissions";
import { activeAdminArea, adminNavigation } from "../src/lib/admin-navigation";

const owner = effectiveAdminPermissions({ role: "OWNER", status: "ACTIVE", grants: [], denies: [] });
describe("admin workspace navigation", () => {
  it("keeps every authorized destination reachable exactly once", () => {
    const paths = adminNavigation(owner).flatMap(group => group.items.map(item => item.href));
    expect(paths.length).toBe(new Set(paths).size);
    expect(paths.sort()).toEqual(ADMIN_AREAS.map(area => area.href).sort());
  });
  it("selects the most specific area for nested routes", () => {
    expect(activeAdminArea("/admin/email/recovery", owner)?.label).toBe("Email recovery");
    expect(activeAdminArea("/admin/email/suppressions/example", owner)?.label).toBe("Email");
    expect(activeAdminArea("/admin/templates/example/edit", owner)?.label).toBe("Ready-made mixes");
    expect(activeAdminArea("/admin/reports/history", owner)?.label).toBe("Reports");
    expect(activeAdminArea("/admin/access-denied", owner)).toBeUndefined();
  });
  it("omits inaccessible destinations and empty groups", () => {
    expect(adminNavigation(["dashboard.read", "mixes.edit"]).map(group => group.label)).toEqual(["Workspace", "Content"]);
    expect(adminNavigation([])).toEqual([]);
    expect(activeAdminArea("/admin/users", ["dashboard.read"])).toBeUndefined();
  });
});
