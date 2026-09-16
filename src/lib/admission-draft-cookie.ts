import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { ADMISSION_DRAFT_COOKIE, ADMISSION_DRAFT_SECONDS, openAdmissionState, sealAdmissionState, type AdmissionDraftState } from "@/lib/admission-draft";

const options = () => ({ httpOnly: true, secure: env.secureSessionCookie, sameSite: "strict" as const, path: "/admin/admission", maxAge: ADMISSION_DRAFT_SECONDS });

export async function readAdmissionDraft(sessionId: string, userId: string) {
  return openAdmissionState((await cookies()).get(ADMISSION_DRAFT_COOKIE)?.value, sessionId, userId);
}

export async function writeAdmissionDraft(state: AdmissionDraftState, sessionId: string, userId: string) {
  (await cookies()).set(ADMISSION_DRAFT_COOKIE, await sealAdmissionState(state, sessionId, userId), options());
}

export async function clearAdmissionDraft() {
  (await cookies()).set(ADMISSION_DRAFT_COOKIE, "", { ...options(), maxAge: 0 });
}
