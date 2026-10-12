"use server";

import { cookies } from "next/headers";
import { requireWorkspace } from "@/lib/auth";
import { browserScope } from "@/lib/browser-scope";
import { env } from "@/lib/env";
import { INVITATION_PROMPT_COOKIE, withInvitationPromptDismissed } from "@/lib/invitation-labels";

/** About 13 months: the longest a browser keeps a cookie. */
const DISMISSED_SECONDS = 400 * 24 * 60 * 60;

/**
 * Remembers in this browser that the signed-in account dismissed Today's invitation prompt (JITM-09 §2.9, D72). The
 * server sets the cookie, as it sets the app's other cookies, so it lasts: Safari keeps cookies a page's script writes
 * for only 7 days. Setting it also re-renders Today without the prompt.
 */
export async function dismissInvitationPromptAction(): Promise<void> {
  const { session } = await requireWorkspace();
  const scope = browserScope(session);
  if (!scope) return;
  const store = await cookies();
  store.set(INVITATION_PROMPT_COOKIE, withInvitationPromptDismissed(store.get(INVITATION_PROMPT_COOKIE)?.value, scope), { httpOnly: true, secure: env.secureSessionCookie, sameSite: "lax", path: "/jumps", maxAge: DISMISSED_SECONDS });
}
