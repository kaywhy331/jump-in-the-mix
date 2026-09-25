import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { phoneSearchDigits } from "@/lib/phone-dial";
import { phoneQueryKeys } from "@/lib/phone-number";
import { prisma } from "@/lib/prisma";
export async function GET(request: Request) {
  const session = await getCurrentSession(); const workspaceId = session?.user.memberships[0]?.workspaceId;
  const headers = { "Cache-Control": "private, no-store" };
  if (!workspaceId) return NextResponse.json({ error: "Sign in again to find recipients." }, { status: 401, headers });
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 120);
  // A typed number matches however the contact's number was saved: with at least four digits the
  // stored `normalized` digits are searched too, an 11-digit 1-prefixed query also tries its ten-digit
  // form, and a whole number also tries its canonical key in the workspace's region.
  const digitForms = [...new Set([...phoneSearchDigits(q), ...await phoneQueryKeys(prisma, workspaceId, q)])];
  const contacts = await prisma.contact.findMany({ where: { workspaceId, archivedAt: null, AND: [{ OR: [{ emails: { some: {} } }, { phones: { some: {} } }] }, ...(q ? [{ OR: [{ displayName: { contains: q, mode: "insensitive" as const } }, { emails: { some: { email: { contains: q, mode: "insensitive" as const } } } }, { phones: { some: { phone: { contains: q } } } }, ...digitForms.map((digits) => ({ phones: { some: { normalized: { contains: digits } } } }))] }] : [])] }, select: { id: true, displayName: true, emails: { select: { email: true }, orderBy: { isPrimary: "desc" } }, phones: { select: { phone: true }, orderBy: { isPrimary: "desc" } } }, orderBy: [{ displayName: "asc" }, { id: "asc" }], take: 21 });
  return NextResponse.json({ contacts: contacts.slice(0, 20), more: contacts.length > 20 }, { headers });
}
