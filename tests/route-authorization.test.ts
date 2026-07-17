import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("server-enforced route authorization matrix", () => {
  it("protects the complete authenticated application subtree through its layout", () => {
    const layout = read("src/app/(app)/layout.tsx");
    expect(layout).toContain("requireWorkspace(");
    expect(layout).toContain("session.authUser.isPlatformAdmin");
    expect(layout).toContain("impersonation=");
  });

  it("requires platform-admin authorization for every covered admin page", () => {
    for (const path of [
      "src/app/(app)/admin/page.tsx",
      "src/app/(app)/admin/users/page.tsx",
      "src/app/(app)/admin/support/page.tsx",
      "src/app/(app)/admin/support/[ticketId]/page.tsx",
      "src/app/(app)/admin/referrals/page.tsx"
    ]) {
      expect(read(path), `${path} must require a platform administrator`).toContain("requirePlatformAdmin(");
    }
  });

  it("validates impersonation targets server-side instead of trusting an actor from the browser", () => {
    const startRoute = read("src/app/api/admin/impersonation/start/route.ts");
    const service = read("src/lib/impersonation.ts");
    expect(startRoute).toContain("requirePlatformAdmin(");
    expect(startRoute).toContain("targetUserId");
    expect(startRoute).toContain("workspaceId");
    expect(startRoute).not.toMatch(/formData\.get\(["']actorUserId/);
    expect(service).toContain("isPlatformAdmin");
    expect(service).toContain("workspaceMember.findFirst");
    expect(service).toContain("admin.impersonation.start");
    expect(service).toContain("admin.impersonation.end");
  });

  it("blocks every impersonated browser mutation except ending the view-only session", () => {
    const proxy = read("src/proxy.ts");
    expect(proxy).toContain("impersonationMutationAllowed");
    expect(proxy).toContain("request.cookies.get(IMPERSONATION_COOKIE)");
    expect(proxy).toContain('const IMPERSONATION_END_PATH = "/api/admin/impersonation/end"');
    expect(proxy).toContain("Administrator impersonation is view-only");
  });

  it("does not expose target-account password, device, referral sharing, or ticket mutation controls during impersonation", () => {
    const account = read("src/app/(app)/account/page.tsx");
    const impersonationBranch = account.match(/if \(impersonation\) \{[\s\S]*?\n  \}\n\n  return \(/)?.[0] ?? "";
    expect(impersonationBranch).toContain("support history are visible");
    expect(impersonationBranch).toContain("every other browser mutation are unavailable");
    expect(impersonationBranch).not.toContain("changePasswordAction");
    expect(impersonationBranch).not.toContain("revokeSessionAction");
    expect(impersonationBranch).not.toContain("Open a support ticket");
    expect(impersonationBranch).toContain("impersonation={Boolean(impersonation)}");
  });

  it("keeps the administrator identity separate from the viewed user identity", () => {
    const auth = read("src/lib/auth.ts");
    expect(auth).toContain("const authUser = session.user");
    expect(auth).toContain("user: impersonation.targetUser");
    expect(auth).toContain("actorUser: session.authUser");
    expect(auth).toContain("session.impersonation || !session.authUser.isPlatformAdmin");
  });
});
