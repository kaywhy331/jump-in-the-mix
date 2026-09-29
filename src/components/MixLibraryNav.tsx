import Link from "next/link";
import { MixFavoriteButton } from "@/components/MixFavoriteButton";
import { AppIcon } from "@/components/AppIcon";

export function MixLibraryNav({ mixes, selected, href, showTabs = true, canEdit = true }: {
  mixes: { id: string; name: string; status: string; people?: number; favorite?: boolean; steps?: { dayOffset: number; anchor: string }[] }[];
  selected?: string;
  href?: (id: string) => string;
  showTabs?: boolean; canEdit?: boolean;
}) {
  return <nav className="mix-library-nav" aria-label="Your Mix library">
    {showTabs && <div className="mix-library-tabs"><Link href="/mixes" aria-current="page"><AppIcon name="mixes" />My Mixes</Link><Link href="/mixes/mega"><AppIcon name="journey" />Mega-Mixes</Link><Link href="/marketplace"><AppIcon name="store" />Marketplace</Link></div>}
    {mixes.map(mix => <div className="mix-library-row" key={mix.id}><Link className="mix-library-item" href={href ? href(mix.id) : `/mixes/${mix.id}/edit`} aria-current={selected === mix.id ? "page" : undefined}>
      <span className="mix-row-icon" aria-hidden="true"><AppIcon name="mixes" /></span>
      <span className="mix-row-copy"><strong>{mix.name}</strong><small>{mix.status.toLowerCase()}{mix.steps && ` · ${mix.steps.length} ${mix.steps.length === 1 ? "Beat" : "Beats"}`}{mix.people !== undefined && ` · ${mix.people} ${mix.people === 1 ? "person" : "people"}`}</small></span>
    </Link>{mix.favorite !== undefined && <MixFavoriteButton target={{ kind: "mix", id: mix.id }} name={mix.name} initial={mix.favorite} canEdit={canEdit} />}</div>)}
  </nav>;
}
