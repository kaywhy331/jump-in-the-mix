"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function safeReturnTo(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/api/") ? value : "/jumps";
}

export async function switchWorkspaceAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (session.impersonation) redirect("/jumps");
  const workspaceId = String(formData.get("workspaceId") ?? "").trim();
  const returnTo = safeReturnTo(String(formData.get("returnTo") ?? "/jumps"));
  const membership = session.user.memberships.find((item) => item.workspaceId === workspaceId)
    ?? await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, workspaceId }, select: { id: true } });
  if (!membership) redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent("That workspace is not available to this account.")}`);
  await prisma.userPreference.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, activeWorkspaceId: workspaceId },
    update: { activeWorkspaceId: workspaceId }
  });
  redirect(returnTo);
}
