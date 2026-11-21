/**
 * The pages of the app shell (`src/app/(app)/layout.tsx`): one root for each folder of `src/app/(app)`. This is the one
 * definition of belonging to the shell. Sign-in returns (`customerReturnPath`) and origin Back (`returnsToOrigin`) both
 * use it, and a unit test keeps it equal to those folders. Safe for client components.
 */
export const APP_SHELL_ROOTS = ["jumps", "contacts", "mixes", "templates", "marketplace", "journey", "calendar", "more", "settings", "account", "help"] as const;

const SHELL_PATH = new RegExp(`^/(?:${APP_SHELL_ROOTS.join("|")})(?:[/?#]|$)`);

/** Whether `path`, a pathname or a path with its query and fragment, is a page of the app shell. */
export function inAppShell(path: string): boolean {
  return SHELL_PATH.test(path);
}
