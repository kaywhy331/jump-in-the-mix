import { AdminNav } from "@/components/AdminNav";
import { requirePlatformAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { permissions } = await requirePlatformAdmin();
  return (
    <div className="admin-layout-shell">
      <AdminNav permissions={permissions} />
      {children}
    </div>
  );
}
