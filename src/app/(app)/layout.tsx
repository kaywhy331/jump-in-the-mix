import { AppShell } from "@/components/AppShell";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { requireWorkspace } from "@/lib/auth";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { BrowserAccountBoundary } from "@/components/BrowserAccountBoundary";
import { browserScope } from "@/lib/browser-scope";
import { invitationsLeft } from "@/lib/invitation-allowance";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { session, actorUser, user, workspace, impersonation } = await requireWorkspace();
  const [displayPreferences, invitations] = await Promise.all([
    displayPreferencesForUser(actorUser.id),
    impersonation ? null : invitationsLeft(user.id, workspace.id)
  ]);
  return (
    <BrowserAccountBoundary key={browserScope(session)!} scope={browserScope(session)!}><AppShell
      userName={user.name}
      displayPreferences={displayPreferences}
      invitationsLeft={invitations}
      impersonation={impersonation ? {
        reference: impersonation.reference,
        targetName: user.name,
        targetEmail: user.email,
        reason: impersonation.reason,
        expiresAt: impersonation.expiresAt.toISOString()
      } : null}
    >
      {children}
      {!impersonation && <PwaInstallPrompt />}
    </AppShell></BrowserAccountBoundary>
  );
}
