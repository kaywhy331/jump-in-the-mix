import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicLanding } from "@/components/PublicLanding";
import { publicPageMetadata } from "@/lib/public-seo";
import { PERSONAS, persona as findPersona } from "@/lib/persona-mixes";

export function generateStaticParams() { return PERSONAS.map(item => ({ profession: item.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ profession: string }> }): Promise<Metadata> {
  const { profession } = await params;
  const persona = findPersona(profession);
  if (!persona || persona.slug !== profession) return {};
  return publicPageMetadata({ path: `/for/${persona.slug}`, title: persona.seoTitle, description: persona.description });
}

export default async function ProfessionPage({ params }: { params: Promise<{ profession: string }> }) {
  const { profession } = await params;
  const persona = findPersona(profession);
  if (!persona || persona.slug !== profession) notFound();
  return <PublicLanding persona={persona} />;
}
