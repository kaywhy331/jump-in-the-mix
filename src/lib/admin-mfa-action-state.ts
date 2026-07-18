export type AdminMfaActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "enabled"; recoveryCodes: string[] }
  | { status: "verified"; redirectTo: string };

export const INITIAL_ADMIN_MFA_STATE: AdminMfaActionState = { status: "idle" };
