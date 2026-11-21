import { accountHome } from "@/lib/account-home";
import { getCurrentSession } from "@/lib/auth";
import { customerReturnPath } from "@/lib/customer-return-path";
import { env } from "@/lib/env";

/**
 * Where a browser that is already signed in belongs instead of a sign-in, sign-up or verification page:
 * only a session that requireWorkspace() accepts as it stands (verified when verification is required,
 * with a workspace, not a support view), so the destination can never send the person back. Everyone
 * else, including a session that cannot be read, gets null and sees the page (JITM-08 §2.39).
 */
export async function signedInHome(next?: string): Promise<string | null> {
  try {
    const session = await getCurrentSession();
    if (!session || session.impersonation) return null;
    if ((env.requireEmailVerification || !env.pilotMode) && !session.user.emailVerifiedAt) return null;
    const membership = session.user.memberships[0];
    if (!membership) return null;
    return await accountHome(session.user.id, membership.workspace.profile?.onboardingDone ? customerReturnPath(next) ?? "/jumps" : "/onboarding");
  } catch {
    return null;
  }
}
