import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ workspace: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children?: ReactNode }) => createElement("a", { href, ...props }, children) }));
vi.mock("@/components/Logo", () => ({ Logo: () => null }));
vi.mock("@/components/OnboardingForm", () => ({ OnboardingForm: () => createElement("div", { "data-onboarding-form": "" }) }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: mocks.workspace }));
vi.mock("@/lib/display-preferences", () => ({ timezoneForUser: async () => "UTC" }));
vi.mock("@/lib/prisma", () => ({ prisma: { workspaceMarketingPreference: { findUnique: async () => null }, contact: { findMany: async () => [] }, workspacePreference: { findUnique: async () => null } } }));
import OnboardingPage from "../src/app/onboarding/page";

const render = async (params: Record<string, string> = {}) => renderToStaticMarkup(await OnboardingPage({ searchParams: Promise.resolve(params) }));
const workspace = (profile: { onboardingStep: number; onboardingDone: boolean } | null) => ({ workspace: { id: "workspace", profile: profile && { ...profile, useCases: ["business"], company: null, smsSignature: null, industry: null } }, user: { id: "owner", name: "Owner" } });

beforeEach(() => { vi.clearAllMocks(); });

describe("opening setup again", () => {
  it("shows that a finished setup is complete, with Today and the Marketplace, instead of the form", async () => {
    mocks.workspace.mockResolvedValue(workspace({ onboardingStep: 5, onboardingDone: true }));
    const page = await render({ verified: "1" });
    expect(page).toContain("<h1>Setup is complete</h1>");
    expect(page).toContain('href="/jumps"');
    expect(page).toContain('href="/marketplace"');
    expect(page).toContain('href="/onboarding?again=1"');
    expect(page).toContain("Your email is verified.");
    expect(page).not.toContain("data-onboarding-form");
  });

  it("offers the form again only when asked with ?again=1", async () => {
    mocks.workspace.mockResolvedValue(workspace({ onboardingStep: 5, onboardingDone: true }));
    const page = await render({ again: "1" });
    expect(page).toContain("data-onboarding-form");
    expect(page).not.toContain("Setup is complete");
  });

  it.each([
    ["answers saved for later (done at step 1)", workspace({ onboardingStep: 1, onboardingDone: true })],
    ["a new workspace", workspace({ onboardingStep: 0, onboardingDone: false })],
    ["no profile yet", workspace(null)]
  ])("keeps the form for %s", async (_case, value) => {
    mocks.workspace.mockResolvedValue(value);
    const page = await render();
    expect(page).toContain("data-onboarding-form");
    expect(page).not.toContain("Setup is complete");
  });
});
