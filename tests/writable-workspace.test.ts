import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ impersonation: null as null | { id: string }, databaseCalls: [] as string[] }));
vi.mock("@/lib/auth", () => ({
  requireWorkspace: async () => ({
    workspace: { id: "workspace-1", name: "Customer business", profile: null },
    user: { id: "customer", name: "Casey Customer" },
    impersonation: state.impersonation
  })
}));
// Any database call after a refused support view means the guard ran too late.
vi.mock("@/lib/prisma", () => {
  const model = (path: string): unknown => new Proxy(() => undefined, {
    get: (_target, key) => typeof key === "symbol" ? undefined : model(`${path}.${String(key)}`),
    apply: () => { state.databaseCalls.push(path); throw new Error(`Unexpected database call: ${path}`); }
  });
  return { prisma: model("prisma") };
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); } }));

import { recoverableFormAction } from "@/lib/form-errors";
import { createContactCustomFieldAction, deleteContactCustomFieldAction, renameContactCustomFieldAction } from "@/lib/custom-field-actions";
import { createCustomDateTypeAction, deleteCustomDateTypeAction, renameCustomDateTypeAction, saveActiveDateTypesAction } from "@/lib/date-type-actions";
import { assignSelectedContactsToActiveGroupAction, createContactGroupAction, deleteContactGroupAction, saveActiveGroupsAction } from "@/lib/group-actions";
import { resumeMixForContactAction, stopMixForContactAction } from "@/lib/mix-stop-actions";
import { completeOnboardingAction, completeOnboardingFormAction, skipOnboardingAction } from "@/lib/onboarding-actions";
import { snoozeJumpAction } from "@/lib/snooze-actions";
import { requireWritableWorkspace, VIEW_ONLY_SUPPORT_MESSAGE, ViewOnlySupportSessionError } from "@/lib/writable-workspace";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function destination(run: () => Promise<unknown>): Promise<string> {
  try { await run(); } catch (error) {
    if (error instanceof Error && error.message.startsWith("REDIRECT ")) return error.message.slice("REDIRECT ".length);
    throw error;
  }
  throw new Error("The action did not redirect.");
}

const refusal = `error=${encodeURIComponent(VIEW_ONLY_SUPPORT_MESSAGE)}`;
const supportView = { id: "support-view" };

beforeEach(() => { state.impersonation = null; state.databaseCalls.length = 0; });

describe("requireWritableWorkspace", () => {
  it("returns the owner's workspace outside a support view, in and out of a form action", async () => {
    const context = await requireWritableWorkspace();
    expect(context.workspace.id).toBe("workspace-1");
    expect(context.impersonation).toBeNull();
    await expect(recoverableFormAction(async () => { await requireWritableWorkspace(); })).resolves.toEqual({});
  });

  it("refuses a support view with the friendly message when nothing else can show it", async () => {
    state.impersonation = supportView;
    const refused = await requireWritableWorkspace().catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ViewOnlySupportSessionError);
    expect((refused as Error).message).toBe("This support session is view-only. End the support view before making changes.");
  });

  it("hands the refusal to a plain action's own error redirect", async () => {
    state.impersonation = supportView;
    const refuse = vi.fn((message: string): never => { throw new Error(`REDIRECT /settings?error=${encodeURIComponent(message)}`); });
    expect(await destination(() => requireWritableWorkspace(refuse))).toBe(`/settings?${refusal}`);
    expect(refuse).toHaveBeenCalledExactlyOnceWith(VIEW_ONLY_SUPPORT_MESSAGE);
  });

  it("returns the refusal as the form's error inside a recoverable form action", async () => {
    state.impersonation = supportView;
    const refuse = vi.fn((message: string): never => { throw new Error(`REDIRECT /settings?error=${message}`); });
    await expect(recoverableFormAction(async () => { await requireWritableWorkspace(refuse); })).resolves.toEqual({ error: VIEW_ONLY_SUPPORT_MESSAGE });
    await expect(recoverableFormAction(async () => { await requireWritableWorkspace(); })).resolves.toEqual({ error: VIEW_ONLY_SUPPORT_MESSAGE });
    expect(refuse).not.toHaveBeenCalled();
  });
});

describe("guarded actions during a support view", () => {
  beforeEach(() => { state.impersonation = supportView; });

  it.each<[string, () => Promise<void>, string]>([
    ["creating a tag", () => createContactGroupAction(form({ name: "Priority" })), "/contacts?"],
    ["deleting a tag", () => deleteContactGroupAction(form({ groupId: "group-1" })), "/contacts?"],
    ["saving active tags", () => saveActiveGroupsAction(form({ activeGroupIds: "group-1" })), "/contacts?"],
    ["tagging selected people", () => assignSelectedContactsToActiveGroupAction(form({ groupId: "group-1", contactIds: "contact-1" })), "/contacts?"],
    ["creating a custom field", () => createContactCustomFieldAction(form({ name: "Gate code" })), "/contacts/custom-fields?"],
    ["renaming a custom field", () => renameContactCustomFieldAction(form({ definitionId: "field-1", name: "Door code" })), "/contacts/custom-fields?"],
    ["deleting a custom field", () => deleteContactCustomFieldAction(form({ definitionId: "field-1" })), "/contacts/custom-fields?"],
    ["creating a date type", () => createCustomDateTypeAction(form({ name: "Warranty expires" })), "/settings/jump-date-types?"],
    ["renaming a date type", () => renameCustomDateTypeAction(form({ dateTypeId: "type-1", name: "Policy renewal" })), "/settings/jump-date-types?"],
    ["saving active date types", () => saveActiveDateTypesAction(form({ activeDateTypeIds: "type-1" })), "/settings/jump-date-types?"],
    ["deleting a date type", () => deleteCustomDateTypeAction(form({ dateTypeId: "type-1" })), "/settings/jump-date-types?"],
    ["snoozing from Today", () => snoozeJumpAction(form({ jumpId: "jump-1", preset: "tomorrow", returnTo: "/jumps?range=all" })), "/jumps?range=all&"],
    ["stopping a mix from Today", () => stopMixForContactAction(form({ contactId: "contact-1", mixId: "mix-1", returnTo: "/jumps?range=all" })), "/jumps?range=all&"],
    ["stopping a mix from a contact", () => stopMixForContactAction(form({ contactId: "contact-1", mixId: "mix-1", returnTo: "/contacts/contact-1" })), "/contacts/contact-1?"],
    ["resuming a mix with a foreign return path", () => resumeMixForContactAction(form({ contactId: "contact-1", mixId: "mix-1", returnTo: "https://elsewhere.example/?next=1" })), "/contacts/contact-1?"],
    ["skipping onboarding", () => skipOnboardingAction(form({ useCase: "business" })), "/onboarding?"],
    ["finishing onboarding outside its form", () => completeOnboardingAction(form({ useCase: "business" })), "/onboarding?"]
  ])("%s returns to the page with the view-only message and reads or writes nothing", async (_label, run, page) => {
    expect(await destination(run)).toBe(`${page}${refusal}`);
    expect(state.databaseCalls).toEqual([]);
  });

  it("finishing onboarding through its form shows the refusal as the form's error", async () => {
    await expect(completeOnboardingFormAction({}, form({ useCase: "business", starterReviewed: "on", starterPreviewAvailable: "1" })))
      .resolves.toEqual({ error: VIEW_ONLY_SUPPORT_MESSAGE });
    expect(state.databaseCalls).toEqual([]);
  });

  it("lets the owner past the guard to the action's own validation", async () => {
    state.impersonation = null;
    expect(await destination(() => createCustomDateTypeAction(form({ name: "" })))).toBe(`/settings/jump-date-types?error=${encodeURIComponent("Give the saved date type a name.")}`);
    const tagRefusal = await destination(() => createContactGroupAction(form({ name: "" })));
    expect(tagRefusal).toMatch(/^\/contacts\?error=/);
    expect(tagRefusal).not.toContain(refusal);
  });
});
