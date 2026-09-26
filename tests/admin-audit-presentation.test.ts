import { expect, it } from "vitest";
import { adminAuditEntityHref, auditChangeSummary } from "../src/lib/admin-audit-presentation";
it("only links related records the operator can read", () => {
  expect(adminAuditEntityHref("SupportTicket", "case-1", ["audit.read"])).toBeNull();
  expect(adminAuditEntityHref("SupportTicket", "case-1", ["support.manage"])).toBe("/admin/support/case-1");
  expect(adminAuditEntityHref("Job", "job&1", ["operations.read"])).toContain("jobId=job%261");
  expect(adminAuditEntityHref("Unknown", "x", ["audit.read"])).toBeNull();
});
it("summarizes changed field names without exposing values", () => {
  const summary = auditChangeSummary({ role: "SUPPORT" }, { role: "OWNER" });
  expect(summary).toBe("Changed: role.");
  expect(summary).not.toContain("OWNER");
  expect(auditChangeSummary({ role: "SUPPORT" }, { role: "SUPPORT" })).toBeNull();
});
