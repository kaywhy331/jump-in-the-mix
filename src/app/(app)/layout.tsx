import { AppShell } from "@/components/AppShell";
import { requireWorkspace } from "@/lib/auth";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace } = await requireWorkspace();
  return (
    <AppShell userName={user.name} workspaceName={workspace.name} planTier={workspace.planTier.toLowerCase()}>
      {children}
    </AppShell>
  );
}
