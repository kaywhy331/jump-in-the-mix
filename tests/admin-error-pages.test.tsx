import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), snapshot: vi.fn(), draft: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { authRateLimitSecret: "admin-error-pages-secret-0000000001" } }));
vi.mock("@/lib/auth", () => ({ requirePlatformAdmin: mocks.admin }));
vi.mock("@/lib/prisma", () => ({ prisma: { waitlistSchedule: { findUnique: async () => null }, reportExport: { findMany: async () => [] } } }));
vi.mock("@/lib/admission", () => ({ getAdmissionSnapshot: mocks.snapshot }));
vi.mock("@/lib/admission-draft-cookie", () => ({ readAdmissionDraft: mocks.draft }));
vi.mock("@/lib/admission-admin-actions", () => ({ changeAdmissionPolicyAction: vi.fn(), discardAdmissionDraftAction: vi.fn() }));
vi.mock("@/lib/transactional-email", () => ({ transactionalEmailConfigured: () => true }));
vi.mock("@/lib/integration-crypto", () => ({ integrationEncryptionConfigured: () => true }));
vi.mock("@/components/AdmissionImpactPreview", () => ({ AdmissionImpactPreview: () => null }));
vi.mock("@/components/FormSubmitButton", () => ({ FormSubmitButton: ({ label }: { label: string }) => createElement("button", { type: "submit" }, label) }));
vi.mock("@/components/AdminRefresh", () => ({ AdminRefresh: () => null }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children?: ReactNode }) => createElement("a", { href, ...props }, children) }));
import AdmissionPage from "../src/app/(staff)/admin/admission/page";
import ReportExportsPage from "../src/app/(staff)/admin/reports/exports/page";
import { withViewerError } from "../src/lib/form-errors";

const session = { id: "staff-session", authUser: { id: "staff-1" } };
const policy = { revision: 4, accountCeiling: 10, outstandingCeiling: 5, collectionPaused: false, grantsPaused: false, referralsPaused: false, redemptionPaused: false };
const draftFields = { accountCeiling: "12", outstandingCeiling: "5", collectionPaused: false, grantsPaused: false, referralsPaused: false, redemptionPaused: false, reason: "Open the next wave" };
const MESSAGE = "The administrator password is incorrect.";
const query = (path: string) => Object.fromEntries(new URL(path, "https://jumpinthemix.com").searchParams);
const render = async (page: (props: { searchParams: Promise<Record<string, string>> }) => Promise<ReactNode>, search: Record<string, string>) =>
  renderToStaticMarkup(await page({ searchParams: Promise.resolve(search) })).replaceAll("<!-- -->", "");
const alerts = (html: string) => [...html.matchAll(/<div class="notice error" role="alert">(.*?)<\/div>/g)].map(match => match[1]);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.admin.mockResolvedValue({ session, user: { id: "staff-1" }, permissions: ["settings.manage", "reports.read"] });
  mocks.snapshot.mockResolvedValue({ policy, accounts: 3, outstanding: 1, committed: 4, remaining: 6 });
  mocks.draft.mockResolvedValue(null);
});

describe("admin pages show a URL error only to the staff member it was signed for", () => {
  it("shows the admission refusal to its staff member and the fixed sentence for any other link", async () => {
    expect(alerts(await render(AdmissionPage, query(withViewerError("/admin/admission", MESSAGE, session))))).toEqual([MESSAGE]);
    expect(alerts(await render(AdmissionPage, query(withViewerError("/admin/admission", MESSAGE, { authUser: { id: "staff-2" } }))))).toEqual(["Something went wrong. Please try again."]);
    expect(alerts(await render(AdmissionPage, { error: "Call +1 800 555 0100 to restore access." }))).toEqual(["Something went wrong. Please try again."]);
    expect(alerts(await render(AdmissionPage, {}))).toEqual([]);
  });

  it("puts the verified admission refusal inside the conflict notice instead of repeating it", async () => {
    mocks.draft.mockResolvedValue({ kind: "draft", operation: "op-1", revision: 3, fields: draftFields });
    const html = await render(AdmissionPage, query(withViewerError("/admin/admission?draft=op-1", MESSAGE, session)));
    expect(alerts(html)).toEqual([`Admission controls changed while this draft was open. Compare your draft with the current saved settings above before confirming a replacement.<p>${MESSAGE}</p>`]);
    const forged = await render(AdmissionPage, { draft: "op-1", error: "Call +1 800 555 0100 to restore access." });
    expect(forged).not.toContain("555 0100");
    expect(forged).toContain("<p>Something went wrong. Please try again.</p>");
  });

  it("uses the export page’s own sentence for a link that is not signed for the viewer or has expired", async () => {
    const path = "/admin/reports/exports?from=2026-09-01&through=2026-09-02";
    expect(alerts(await render(ReportExportsPage, query(withViewerError(path, "Choose valid start and end dates.", session))))).toEqual(["Choose valid start and end dates."]);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000);
    expect(alerts(await render(ReportExportsPage, query(withViewerError(path, "Choose valid start and end dates.", session, twoHoursAgo))))).toEqual(["The export could not be requested. Please try again."]);
  });
});
