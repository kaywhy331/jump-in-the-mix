import { describe, expect, it } from "vitest";
import { ADMIN_AREAS, effectiveAdminPermissions } from "../src/lib/admin-permissions";
import { activeAdminArea, adminNavigation, firstAdminDestination, safeAdminReturnTo, adminPage, adminQuery } from "../src/lib/admin-navigation";

const owner = effectiveAdminPermissions({ role: "OWNER", status: "ACTIVE", grants: [], denies: [] });
describe("admin workspace navigation", () => {
  it("keeps every authorized destination reachable exactly once", () => {
    const paths = adminNavigation(owner).flatMap(group => group.items.map(item => item.href));
    expect(paths.length).toBe(new Set(paths).size);
    expect(paths.sort()).toEqual(ADMIN_AREAS.map(area => area.href).sort());
  });
  it("selects the most specific area for nested routes", () => {
    expect(activeAdminArea("/admin/email/recovery", owner)?.label).toBe("Email recovery");
    expect(activeAdminArea("/admin/email/suppressions/example", owner)?.label).toBe("Suppression");
    expect(activeAdminArea("/admin/templates/example/edit", owner)?.label).toBe("Ready-made Mixes");
    expect(activeAdminArea("/admin/reports/history", owner)?.label).toBe("Report history");
    expect(activeAdminArea("/admin/access-denied", owner)).toBeUndefined();
  });
  it("omits inaccessible destinations and empty groups", () => {
    expect(adminNavigation(["dashboard.read", "mixes.edit"]).map(group => group.label)).toEqual(["Overview", "Content"]);
    expect(adminNavigation([])).toEqual([]);
    expect(activeAdminArea("/admin/users", ["dashboard.read"])).toBeUndefined();
  });
});

it("limits primary navigation to eight task destinations", () => {
  expect(adminNavigation(owner).map(group => group.label)).toEqual(["Overview", "Customers", "Access", "Support", "Content", "Reports", "Operations", "Settings"]);
});
it("returns restricted staff to a permitted destination", () => {
  expect(firstAdminDestination(["support.manage"])).toBe("/admin/support");
  expect(firstAdminDestination([])).toBe("/account/admin-mfa");
});
it("preserves local queue context without accepting external or lookalike returns", () => {
  const path = "/admin/support?view=mine&q=case%20name&page=2";
  expect(safeAdminReturnTo(path)).toBe(path);
  for (const value of ["//evil.test/admin", "https://evil.test/admin", "/administrator", "/admin/../login", "/admin/access-denied", "/admin\\evil", "/admin\n"]) expect(safeAdminReturnTo(value, "/admin/support")).toBe("/admin/support");
  expect(adminPage("Infinity")).toBe(1);
  expect(adminPage("2.5")).toBe(1);
  expect(adminPage("2")).toBe(2);
  expect(adminQuery("/admin/support", { q: "a&b", page: 2, status: undefined })).toBe("/admin/support?q=a%26b&page=2");
});
