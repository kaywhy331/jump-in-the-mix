import { describe, expect, it } from "vitest";
import { ADMIN_PERMISSIONS, effectiveAdminPermissions, hasAdminPermission, STAFF_ROLES, type StaffAccess } from "../src/lib/admin-permissions";
import { redactedAuditData } from "../src/lib/audit-redaction";

const membership = (role: StaffAccess["role"], grants: string[] = [], denies: string[] = []): StaffAccess => ({ role, grants, denies, status: "ACTIVE" });
describe("staff role and override policy", () => {
  it.each(STAFF_ROLES)("defaults to no customer-content access for %s", role => {
    expect(hasAdminPermission(membership(role), "support.view_customer")).toBe(false);
  });
  it("separates growth, support, editing, publishing and operation powers", () => {
    expect(effectiveAdminPermissions(membership("GROWTH"))).toEqual(expect.arrayContaining(["waitlist.read", "waitlist.manage", "waves.pause"]));
    expect(hasAdminPermission(membership("GROWTH"), "users.read")).toBe(false);
    expect(hasAdminPermission(membership("SUPPORT"), "support.manage")).toBe(true);
    expect(hasAdminPermission(membership("SUPPORT"), "waitlist.read")).toBe(false);
    expect(hasAdminPermission(membership("EDITOR"), "mixes.edit")).toBe(true);
    expect(hasAdminPermission(membership("EDITOR"), "mixes.publish")).toBe(false);
    expect(hasAdminPermission(membership("OPERATOR"), "jobs.retry")).toBe(true);
    expect(hasAdminPermission(membership("ANALYST"), "audit.read")).toBe(false);
  });
  it("applies individual grants with denial precedence and owner-only team management", () => {
    expect(hasAdminPermission(membership("EDITOR", ["mixes.publish"]), "mixes.publish")).toBe(true);
    expect(hasAdminPermission(membership("EDITOR", ["mixes.publish"], ["mixes.publish"]), "mixes.publish")).toBe(false);
    expect(hasAdminPermission(membership("OPERATOR", ["staff.manage"]), "staff.manage")).toBe(false);
    expect(hasAdminPermission(membership("OWNER"), "staff.manage")).toBe(true);
  });
  it("denies every permission for absent or disabled memberships", () => {
    for (const permission of Object.keys(ADMIN_PERMISSIONS) as Array<keyof typeof ADMIN_PERMISSIONS>) {
      expect(hasAdminPermission(null, permission)).toBe(false);
      expect(hasAdminPermission({ ...membership("OWNER"), status: "DISABLED" }, permission)).toBe(false);
    }
  });
  it("redacts nested credentials, message content and URLs while retaining event context", () => {
    expect(redactedAuditData({ action: "update", steps: [{ body: "private text", channel: "EMAIL" }], tokenHash: "private", reason: "See https://example.test/?invite=secret" })).toEqual({ action: "update", steps: [{ body: "[redacted]", channel: "EMAIL" }], tokenHash: "[redacted]", reason: "See [url redacted]" });
  });
});
