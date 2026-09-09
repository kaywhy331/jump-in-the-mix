import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("server-enforced route authorization matrix", () => {
  it("protects the complete authenticated application subtree through its layout", () => {
    const layout = read("src/app/(app)/layout.tsx");
    expect(layout).toContain("requireWorkspace(");
    expect(layout).toContain("impersonation=");
    expect(layout).not.toContain("isPlatformAdmin");
  });

  it("requires platform-admin authorization for every covered admin page", () => {
    for (const path of [
      "src/app/(staff)/admin/page.tsx",
      "src/app/(staff)/admin/users/page.tsx",
      "src/app/(staff)/admin/support/page.tsx",
      "src/app/(staff)/admin/support/[ticketId]/page.tsx",
      "src/app/(staff)/admin/templates/page.tsx",
      "src/app/(staff)/admin/system-mix/page.tsx",
      "src/app/(staff)/admin/templates/[sharedMixId]/edit/page.tsx",
      "src/app/(staff)/admin/operations/page.tsx",
      "src/app/(staff)/admin/audit/page.tsx",
      "src/app/(staff)/admin/settings/page.tsx"
    ]) {
      expect(read(path), `${path} must require a platform administrator`).toContain("requirePlatformAdmin(");
    }
  });

  it("validates impersonation targets server-side instead of trusting an actor from the browser", () => {
    const startRoute = read("src/app/api/admin/impersonation/start/route.ts");
    const service = read("src/lib/impersonation.ts");
    expect(startRoute).toContain("requirePlatformAdmin(");
    expect(startRoute).toContain("ticketId");
    expect(startRoute).toContain("actorSessionId: session.id");
    expect(startRoute).not.toMatch(/formData\.get\(["'](?:targetUserId|workspaceId)/);
    expect(startRoute).not.toMatch(/formData\.get\(["']actorUserId/);
    expect(service).toContain("assertSupportActor(tx, input, true)");
    expect(service).toContain("workspaceMember.findFirst");
    expect(service).toContain("admin.impersonation.start");
    expect(service).toContain("admin.impersonation.end");
  });

  it("blocks every impersonated browser mutation except ending the view-only session", () => {
    const proxy = read("src/proxy.ts");
    expect(proxy).toContain("impersonationMutationAllowed");
    expect(proxy).toContain("request.cookies.get(IMPERSONATION_COOKIE)");
    expect(proxy).toContain('const IMPERSONATION_END_PATH = "/api/admin/impersonation/end"');
    expect(proxy).toContain("This support session is view-only");
  });

  it("does not expose target-account security or mutation controls during support viewing", () => {
    const account = read("src/app/(app)/account/page.tsx").replaceAll("\r\n", "\n");
    const start = account.indexOf("if (impersonation) return");
    const end = account.indexOf("\n\n  return <div className=\"page account-page\">", start);
    const impersonationBranch = account.slice(start, end);
    expect(impersonationBranch).toContain("personal controls remain private");
    expect(impersonationBranch).toContain("cannot change personal account settings");
    expect(impersonationBranch).not.toContain("changePasswordAction");
    expect(impersonationBranch).not.toContain("revokeSessionAction");
    expect(account).not.toMatch(/Referral|Billing|Connection/);
  });

  it("keeps the administrator identity separate from the viewed user identity", () => {
    const auth = read("src/lib/auth.ts");
    expect(auth).toContain("const authUser = session.user");
    expect(auth).toContain("user: impersonation.targetUser");
    expect(auth).toContain("actorUser: session.authUser");
    expect(auth).toContain("session.impersonation || !session.authUser.emailVerifiedAt");
    expect(auth).toContain('staff?.status !== "ACTIVE"');
    expect(auth).toContain("hasAdminPermission(identity.staff, p)");
  });
});
