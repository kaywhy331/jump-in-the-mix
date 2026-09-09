import { prisma } from "@/lib/prisma";

export async function accountHome(userId: string, customerPath = "/jumps") {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { staffMembership: { select: { status: true } }, _count: { select: { memberships: true } } } });
  return user?.staffMembership?.status === "ACTIVE" && user._count.memberships === 0 ? "/admin" : customerPath;
}
