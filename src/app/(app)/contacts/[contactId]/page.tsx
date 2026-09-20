import type { Metadata } from "next";
import { ContactProfile, type ContactProfileSearchParams } from "@/components/ContactProfile";

export const metadata: Metadata = { title: "Contact details" };

export default async function ContactDetailPage({ params, searchParams }: { params: Promise<{ contactId: string }>; searchParams: Promise<ContactProfileSearchParams> }) {
  const [{ contactId }, query] = await Promise.all([params, searchParams]);
  return <ContactProfile contactId={contactId} query={query} />;
}
