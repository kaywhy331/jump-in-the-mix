import { beforeEach, describe, expect, it, vi } from "vitest";

const APP_URL = "https://app.jumpinthemix.test";
const mocks = vi.hoisted(() => ({ create: vi.fn(), end: vi.fn(), session: vi.fn(), permission: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, env: { ...actual.env, appUrl: "https://app.jumpinthemix.test", authRateLimitSecret: "impersonation-redirect-secret-00001" } };
});
vi.mock("@/lib/auth", () => ({ requirePlatformAdmin: async () => ({ user: { id: "staff-1" }, session: { id: "staff-session", authUser: { id: "staff-1" } } }), getCurrentSession: mocks.session }));
vi.mock("@/lib/impersonation", () => ({
  createAdminImpersonationGrant: mocks.create,
  endAdminImpersonationGrant: mocks.end,
  impersonationCookieOptions: (expires: Date) => ({ httpOnly: true, sameSite: "strict" as const, secure: true, path: "/", expires })
}));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.limit }));
vi.mock("@/lib/staff-access", () => ({ userHasAdminPermission: mocks.permission }));
import { POST as endView } from "@/app/api/admin/impersonation/end/route";
import { POST as startView } from "@/app/api/admin/impersonation/start/route";
import { env } from "@/lib/env";
import { SupportAccessError } from "@/lib/support-case-access";
import { UNVERIFIED_ERROR_MESSAGE, viewerErrorMessage } from "@/lib/form-errors";

// What a misconfigured edge could forward from the client.
const forged = { host: "attacker.example", "x-forwarded-host": "evil.example, app.jumpinthemix.test", "x-forwarded-proto": "http" };

function post(path: string, fields: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request(`http://0.0.0.0:10000${path}`, { method: "POST", headers: { ...forged, "content-type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(fields) });
}

function location(response: Response): URL {
  expect(response.status).toBe(303);
  const value = response.headers.get("location") ?? "";
  expect(value).not.toMatch(/attacker|evil|0\.0\.0\.0/);
  return new URL(value);
}

/** The refusal is shown to the staff member who started the view, and only the fixed sentence to anyone else. */
function refusal(url: URL): string | null {
  const params = Object.fromEntries(url.searchParams);
  expect(viewerErrorMessage(params, { authUser: { id: "staff-2" } })).toBe(UNVERIFIED_ERROR_MESSAGE);
  return viewerErrorMessage(params, { authUser: { id: "staff-1" } });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.limit.mockResolvedValue({ allowed: true, remaining: 9, retryAfterSeconds: 0 });
});

describe("support-view redirects use the configured application URL", () => {
  it("starts the view on Today at APP_URL whatever Host and X-Forwarded-Host say", async () => {
    mocks.create.mockResolvedValueOnce({ rawToken: "raw-view-token", grant: { expiresAt: new Date(Date.now() + 30 * 60_000) } });
    const response = await startView(post("/api/admin/impersonation/start", { ticketId: "ticket-1", assignmentRevision: "1", reason: "Investigate the missing follow-up" }));
    expect(location(response).href).toBe(`${APP_URL}/jumps?impersonating=1`);
    expect(response.headers.get("set-cookie")).toContain(`${env.impersonationCookieName}=raw-view-token`);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: "staff-1", actorSessionId: "staff-session", ticketId: "ticket-1", expectedRevision: 1 }));
  });

  it("returns refusals to the case or the support list at APP_URL", async () => {
    mocks.create.mockRejectedValueOnce(new SupportAccessError("This case is no longer assigned to you."));
    const refused = location(await startView(post("/api/admin/impersonation/start", { ticketId: "ticket-1", assignmentRevision: "1", reason: "Investigate" })));
    expect(refused.origin).toBe(APP_URL);
    expect(refused.pathname).toBe("/admin/support/ticket-1");
    expect(refusal(refused)).toBe("This case is no longer assigned to you.");

    mocks.create.mockRejectedValueOnce(new Error("database unavailable"));
    const failed = location(await startView(post("/api/admin/impersonation/start", { ticketId: "ticket-1", assignmentRevision: "1", reason: "Investigate" })));
    expect(`${failed.origin}${failed.pathname}`).toBe(`${APP_URL}/admin/support/ticket-1`);
    expect(refusal(failed)).toBe("The view-only session could not be started.");

    const invalid = location(await startView(post("/api/admin/impersonation/start", { ticketId: "" })));
    expect(`${invalid.origin}${invalid.pathname}`).toBe(`${APP_URL}/admin/support`);
    expect(refusal(invalid)).toBe("Choose a valid support ticket.");
  });

  it("ends the view back on the support list at APP_URL and clears the cookie", async () => {
    mocks.session.mockResolvedValueOnce({ authUser: { id: "staff-1" } });
    mocks.permission.mockResolvedValueOnce(true);
    mocks.end.mockResolvedValueOnce(true);
    const response = await endView(post("/api/admin/impersonation/end", {}, { cookie: `jitm_session=session; ${env.impersonationCookieName}=raw-view-token` }));
    expect(location(response).href).toBe(`${APP_URL}/admin/support?impersonationEnded=1`);
    expect(mocks.end).toHaveBeenCalledExactlyOnceWith("raw-view-token", "staff-1");
    expect(response.headers.get("set-cookie")).toMatch(new RegExp(`^${env.impersonationCookieName}=;`));
  });

  it("sends a browser without a staff session to sign-in at APP_URL", async () => {
    mocks.session.mockResolvedValueOnce(null);
    const response = await endView(post("/api/admin/impersonation/end", {}, { cookie: `${env.impersonationCookieName}=stale-token` }));
    expect(location(response).href).toBe(`${APP_URL}/login`);
    expect(mocks.end).not.toHaveBeenCalled();
  });
});
