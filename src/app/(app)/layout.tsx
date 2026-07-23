import { AppShell } from "@/components/AppShell";
import { requireWorkspace } from "@/lib/auth";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, impersonation } = await requireWorkspace();
  return (
    <AppShell
      userName={user.name}
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
