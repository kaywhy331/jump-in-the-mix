// Safe for client components: no database access.
export const INVITATIONS_PATH = "/mixes/system";

/** "3 invitations left" / "1 invitation left". */
export function invitationsLeftLabel(count: number): string {
  return `${count} invitation${count === 1 ? "" : "s"} left`;
}
