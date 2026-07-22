export type UserMfaActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "enabled"; recoveryCodes: string[] }
  | { status: "verified"; redirectTo: string };

export const INITIAL_USER_MFA_STATE: UserMfaActionState = { status: "idle" };
