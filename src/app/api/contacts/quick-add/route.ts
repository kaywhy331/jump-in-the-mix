import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth";
import { quickAddDeviceContacts } from "@/lib/contact-quick-add";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";

const optionalText = (length: number) => z.string().trim().max(length).nullable().optional();
const addressSchema = z.object({
  addressLines: z.array(z.string().max(240).nullable()).max(4).optional().default([]),
  city: optionalText(120),
  region: optionalText(120),
  postalCode: optionalText(40),
  country: optionalText(120)
}).strict();

const deviceContactSchema = z.object({
  names: z.array(z.string().max(240)).max(5),
  emails: z.array(z.string().max(320)).max(20),
  phones: z.array(z.string().max(80)).max(20),
  addresses: z.array(addressSchema).max(20)
}).strict().refine(
  (contact) => [...contact.names, ...contact.emails, ...contact.phones].some((value) => value.trim()),
  { message: "Every selected device Contact needs a name, email, or phone number." }
);

const requestSchema = z.object({
  requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
  contacts: z.array(deviceContactSchema).min(1).max(50)
}).strict();

export async function POST(request: Request) {
  const session = await getCurrentSession();
  const membership = session?.user.memberships[0];
  if (!session || !membership) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.impersonation) return NextResponse.json({ error: "Administrator support sessions are view-only." }, { status: 403 });

  const metadata = await getRequestMetadata();
  const rateLimit = await consumeRateLimit({
    scope: "api.contact-quick-add",
    identifiers: [membership.workspaceId, session.authUser.id, metadata.ipAddress],
    limit: 40,
    windowMs: 60 * 60 * 1000,
    blockMs: 15 * 60 * 1000
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many Quick Add requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "The selected device Contacts could not be read.", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await quickAddDeviceContacts({
      workspaceId: membership.workspaceId,
      actorUserId: session.authUser.id,
      timezone: membership.workspace.profile?.timezone ?? "America/New_York",
      requestId: parsed.data.requestId,
      contacts: parsed.data.contacts
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The selected Contacts could not be added." },
      { status: 400 }
    );
  }
}
