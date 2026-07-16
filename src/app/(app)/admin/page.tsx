import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";

export default async function AdminPage() {
  await requirePlatformAdmin();
  redirect("/admin/users");
}