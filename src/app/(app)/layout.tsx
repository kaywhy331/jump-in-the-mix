import { AppShell } from "@/components/AppShell";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { requireWorkspace } from "@/lib/auth";
import { displayPreferencesForUser } from "@/lib/display-preferences";
import { BrowserAccountBoundary } from "@/components/BrowserAccountBoundary";
import { browserScope } from "@/lib/browser-scope";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { session, actorUser, user, impersonation } = await requireWorkspace();
  const displayPreferences = await displayPreferencesForUser(actorUser.id);
  return (
    <BrowserAccountBoundary key={browserScope(session)!} scope={browserScope(session)!}><AppShell
      userName={user.name}
      displayPreferences={displayPreferences}
      impersonation={impersonation ? {
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
