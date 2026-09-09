import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PublicLeadForm } from "@/components/PublicLeadForm";
export const metadata = { title: "Get in touch", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function LeadFormPage({ params }: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await params;
  const connection = await prisma.intakeConnection.findFirst({ where: { id: connectionId, kind: "HOSTED_FORM", enabled: true }, select: { id: true, workspace: { select: { name: true } } } });
  if (!connection) notFound();
  return <main className="public-lead-page"><div className="public-lead-brand">{connection.workspace.name}</div><section className="card"><h1>Let’s get in touch</h1><p>Tell {connection.workspace.name} a little about what you need.</p><PublicLeadForm connectionId={connection.id} eventId={randomUUID()} businessName={connection.workspace.name} /></section><p className="muted-copy">Powered by <Link className="inline-action" href="/">Jump in the Mix</Link></p></main>;
}
