import { createHmac, randomUUID } from "node:crypto";
import { jwtDecrypt } from "jose";
import { describe, expect, it } from "vitest";
import { env } from "../src/lib/env";
import { ADMISSION_DRAFT_SECONDS, admissionDraftFields, openAdmissionState, sealAdmissionState, type AdmissionDraftState } from "../src/lib/admission-draft";

const fields = { accountCeiling: "1", outstandingCeiling: "1", collectionPaused: false, grantsPaused: false, referralsPaused: true, redemptionPaused: false, reason: "Synthetic admission review" };
const draft = (): Extract<AdmissionDraftState, { kind: "draft" }> => ({ kind: "draft", operation: randomUUID(), revision: 3, fields });
describe("session-bound admission draft", () => {
  it("round trips only allowed fields and never stores credentials", async () => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) if (typeof v === "string") form.set(k, v); else if (v) form.set(k, "on");
    form.set("currentPassword", "password-must-not-be-retained"); form.set("code", "mfa-must-not-be-retained");
    form.set("actorSessionId", "untrusted-session");
    expect(admissionDraftFields(form)).toEqual(fields);
    const state = { ...draft(), fields: { ...admissionDraftFields(form)!, currentPassword: form.get("currentPassword"), code: form.get("code") } } as AdmissionDraftState;
    const token = await sealAdmissionState(state, "session-a", "user-a");
    expect(await openAdmissionState(token, "session-a", "user-a")).toEqual({ ...state, fields });
    const key = createHmac("sha256", env.dataEncryptionKey).update("admission-draft:v1").digest();
    const { payload } = await jwtDecrypt(token, key);
    expect(JSON.stringify(payload)).not.toMatch(/password-must-not-be-retained|mfa-must-not-be-retained|currentPassword|untrusted-session/);
  });
  it("rejects another session/user, tampering, an expired draft and oversized input", async () => {
    const now = Date.now(), token = await sealAdmissionState(draft(), "session-a", "user-a", now);
    expect(await openAdmissionState(token, "session-b", "user-a")).toBeNull();
    expect(await openAdmissionState(token, "session-a", "user-b")).toBeNull();
    const parts = token.split("."); parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);
    expect(await openAdmissionState(parts.join("."), "session-a", "user-a")).toBeNull();
    expect(await openAdmissionState(token, "session-a", "user-a", now + ADMISSION_DRAFT_SECONDS * 1000 + 1000)).toBeNull();
    expect(await openAdmissionState("a".repeat(3801), "session-a", "user-a")).toBeNull();
    const form = new FormData(); form.set("reason", "a".repeat(501));
    expect(admissionDraftFields(form)).toBeNull();
  });
  it.each(["界".repeat(500), "\u0001".repeat(500), "🟢".repeat(250)])("preserves a maximum-length reason within the cookie limit (%#)", async reason => {
    const state: AdmissionDraftState = { ...draft(), kind: "draft", fields: { ...fields, accountCeiling: "1".repeat(32), outstandingCeiling: "1".repeat(32), reason } };
    const token = await sealAdmissionState(state, "session-a", "user-a");
    expect(token.length).toBeLessThan(3800);
    expect(await openAdmissionState(token, "session-a", "user-a")).toEqual(state);
  });
  it("keeps a saved receipt distinct from a draft and bound to its session", async () => {
    const state: AdmissionDraftState = { kind: "saved", revision: 4, operation: randomUUID() };
    const token = await sealAdmissionState(state, "session-a", "user-a");
    expect(await openAdmissionState(token, "session-a", "user-a")).toEqual(state);
    expect(await openAdmissionState(token, "session-b", "user-a")).toBeNull();
  });
});
