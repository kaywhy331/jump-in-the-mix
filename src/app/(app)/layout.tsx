import { AppShell } from "@/components/AppShell";
import { requireWorkspace } from "@/lib/auth";
import { env } from "@/lib/env";
import { referralShareMessage, referralShareUrl } from "@/lib/referral";
import { ensureWorkspaceReferralAccount } from "@/lib/referral-service";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { session, user, workspace, impersonation } = await requireWorkspace();
  const referralAccount = impersonation ? null : await ensureWorkspaceReferralAccount(workspace.id);
  const referralMessage = referralAccount
    ? referralShareMessage(referralShareUrl(env.appUrl, referralAccount.code))
    : null;
  return (
    <AppShell
      userName={user.name}
      workspaceName={workspace.name}
      planTier={workspace.planTier.toLowerCase()}
      isPlatformAdmin={session.authUser.isPlatformAdmin}
      referralMessage={referralMessage}
      impersonation={impersonation ? {
        targetName: user.name,
        targetEmail: user.email,
        reason: impersonation.reason,
        expiresAt: impersonation.expiresAt.toISOString()
      } : null}
    >
      {children}
    </AppShell>
  );
}
