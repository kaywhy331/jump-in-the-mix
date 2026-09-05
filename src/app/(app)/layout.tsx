import { AppShell } from "@/components/AppShell";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { requireWorkspace } from "@/lib/auth";
import { displayPreferencesForUser } from "@/lib/display-preferences";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { actorUser, user, impersonation } = await requireWorkspace();
  const displayPreferences = await displayPreferencesForUser(actorUser.id);
  return (
    <AppShell
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
    </AppShell>
  );
}
