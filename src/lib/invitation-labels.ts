// Safe for client components: no database access.
export const INVITATIONS_PATH = "/mixes/system";

/** "3 invitations left" / "1 invitation left". */
export function invitationsLeftLabel(count: number): string {
  return `${count} invitation${count === 1 ? "" : "s"} left`;
}

/**
 * Today's invitation prompt stays dismissed through a cookie that lists, by browser scope (a non-authorizing hash, never
 * an account id), the accounts that dismissed it in this browser. The server reads it, so a dismissed prompt is never
 * rendered and can't show before the page's scripts run (JITM-09 §2.9, D72).
 */
export const INVITATION_PROMPT_COOKIE = "jitm_invitation_prompt";

/** Whether the cookie's value lists `scope`. */
export function invitationPromptDismissed(value: string | undefined, scope: string | null): boolean {
  return Boolean(scope && value?.split(".").includes(scope));
}

/** The cookie's value once `scope` has dismissed the prompt: the latest three accounts. */
export function withInvitationPromptDismissed(value: string | undefined, scope: string): string {
  return [...(value?.split(".").filter(item => item && item !== scope) ?? []), scope].slice(-3).join(".");
}
